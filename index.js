const util = require('util')
const zlib = require('zlib')
const {URL} = require('url')
const h2 = require('http2')
const mkdirp = require('zmkdirp')
const fs = require('fs')
const path = require('path')
const [fopen, fclose, ftrunc, lstat] = [fs.open, fs.close, fs.ftruncate, fs.lstat].map(util.promisify)
const {
	HTTP2_HEADER_PATH,
	HTTP2_HEADER_STATUS,
	HTTP2_HEADER_METHOD,
	HTTP2_HEADER_CONTENT_TYPE,
	HTTP2_HEADER_CONTENT_LENGTH,
	HTTP2_HEADER_USER_AGENT,
	HTTP2_HEADER_COOKIE,
	HTTP2_HEADER_ACCEPT_ENCODING,
	HTTP2_HEADER_CONTENT_ENCODING,
} = h2.constants

const base = 'https://www.mangadex.org'
const UA = 'Mozilla/5.0 (Windows NT 6.3; WOW64)'
const COOKIES = 'mangadex_h_toggle=1'
const ACCEPTENC = 'deflate, gzip'

let limit = 3
const BACKPRESSURE = []
const fixPressure = () => {
	if (limit++ && BACKPRESSURE.length)
		return BACKPRESSURE.shift()(limit--)
}

const requestRateLimiter = () => new Promise(r => {
	BACKPRESSURE.push(r)
	if (limit > 1) BACKPRESSURE.shift()(limit--)
	setTimeout(fixPressure, 3e3+BACKPRESSURE.length * 1e3)
})

const dISO = () => new Date().toISOString().replace('T', ' ').replace('Z','')
const connections = new Map
const getConnection = url => {
	const h = new URL(url, base)
	let c = connections.get(h.hostname)
	if (c) return c

	let connection = h2.connect(h.origin)
	connection.on('connect', () => {
		console.log('[CONNECTION %s] Connected to %s with alpn %j.', dISO(), h.hostname, connection.alpnProtocol)
	})
	connections.set(h.hostname, connection)
	connection.setTimeout(6e5, connection.close)
	connection.on('timeout', connection.unref)
	connection.on('goaway', (err, strid, data) => {
		connections.delete(h.hostname)
		console.log('[CONNECTION %s] Recieved GOAWAY frame err %d, last stream %d, data %s (%j)', dISO(), err, strid, data, data)
		connection.close(() => console.log('[CONNECTION %s] Closed connection with %s.', dISO(), h.hostname))
	})
	connection.on(
		'close',
		connections.delete.bind(connections, h.hostname)
	)
	connection.on('close', connection.unref)
	return connection
}


const genres = [
	null,
	'4-koma',
	'Action',
	'Adventure',
	'Award Winning',
	'Comedy',
	'Cooking',
	'Doujinshi',
	'Drama',
	'Ecchi',
	'Fantasy',
	'Gender Bender',
	'Harem',
	'Historical',
	'Horror',
	'Josei',
	'Martial Arts',
	'Mecha',
	'Medical',
	'Music',
	'Mystery',
	'Oneshot',
	'Psychological',
	'Romance',
	'School Life',
	'Sci-Fi',
	'Seinen',
	'Shoujo',
	'Shoujo Ai',
	'Shounen',
	'Shounen Ai',
	'Slice of Life',
	'Smut',
	'Sports',
	'Supernatural',
	'Tragedy',
	'Webtoon',
	'Yaoi',
	'Yuri',
	'[no chapters]',
	'Game'
]
const stati = [
	'unknown',
	'ongoing',
	'completed'
]
const sort = (a, b) => (
	!isNaN(a.volume) 
	&& !isNaN(b.volume) 
	&& (Number.parseInt(a.volume) - Number.parseInt(b.volume)) !== 0
)
	? Number.parseInt(a.volume) - Number.parseInt(b.volume)
	: (
		isNaN(a.chapter)
		&& !isNaN(b.chapter)
		&& (Number.parseFloat(a.chapter) - Number.parseFloat(b.chapter)) !== 0
	)
		? Number.parseFloat(a.chapter) - Number.parseFloat(b.chapter)
		: a.timestamp.valueOf() - b.timestamp.valueOf()

const doGroups = (n1,i1,n2,i2,n3,i3) => {
	let g = []
	if (i1) g.push({group:n1,groupid:i1})
	if (i2) g.push({group:n2,groupid:i2})
	if (i3) g.push({group:n3,groupid:i3})
	return g
}


const durl = new Map
const nchinfo = {pages:[],dataurl:null}

const chrewrite = ({
	cid, timestamp,
	chapter, volume,
	lang_code, title,
	group_name, group_id,
	group_name_2, group_id_2,
	group_name_3, group_id_3,
	chinfo = timestamp.valueOf() > Date.now() ? nchinfo : durl.get(cid) || nchinfo
}) => ({
	cid,
	timestamp,
	chapter, ch: Number(chapter),
	volume, vol: Number(volume),
	lang: lang_code,
	ctitle: title,
	groups: doGroups(group_name,group_id,group_name_2,group_id_2,group_name_3,group_id_3),
	dataurl: chinfo.dataurl,
	npages: chinfo.pages.length,
	pages: chinfo.pages
})

const ms = 1e3
const mangarev = (k, v) => {
	switch (k) {
		case 'timestamp': return new Date(v*ms)
		case 'genres': return v.reduce((a=[],g)=>[
			...a,
			genres[g] || genre[0]
		], [])
		case 'status': return stati[v] || stati[0]
		case 'chapter':
			if ('string' === typeof v) return v
			const a = []
			for (const key in v) if (v.hasOwnProperty(key))
				a.push({cid: Number.parseInt(key, 10), ...v[key]})

			return a.sort(sort).map(chrewrite)
		default: return v
	}
}

const cStr = (res, heads) => {
	switch (heads[HTTP2_HEADER_CONTENT_ENCODING]) {
		case 'gzip':
			return res.pipe(zlib.createGunzip())
		case 'deflate':
			return res.pipe(zlib.createInflate())
		default:
			return res
	}
}

const dtx = stream => new Promise(r => {
	const decoder = new util.TextDecoder
	let datas = ''
	stream.on('end', d => r(datas + decoder.decode(d, {stream: false})))
	stream.on('data', data => datas += decoder.decode(data, {stream: true}))
})

async function manga(data, res, rej, heads, flags) {
	if (heads[HTTP2_HEADER_STATUS] !== 200) {
		rej(heads)
		throw heads
	}
	const j = JSON.parse(await dtx(cStr(this, heads)), mangarev)
	res(j)
	return j
}

const rgx = {
	// volchtitle: /<title>(?:Vol\. (\S+))?\s*(?:Ch\. (\S+))?\s*\((.+?)\) - MangaDex<\/title>/,
	// thumb: /<meta property="og:image" content="(.+\/\d+\.thumb\.[^"]+)">/,
	// chapid: /var chapter_id = (\d+);/,
	// prchid: /var prev_chapter_id = (\d+);/,
	// nxchid: /var next_chapter_id = (\d+);/,
	// mangid: /var manga_id = (\d+);/,
	// dataurl: /var dataurl = '([0-9a-z]{32})';/,
	// pagearr: /var page_array = (\[[^\]]+\]);?/,
	// serverm: /var server = '([^']+)';/,
	chapter: /<script data-type=(['"])chapter\1>(\{.*?\})<\/script>/
}
async function chapter(data, res, rej, heads, flags) {
	if (heads[HTTP2_HEADER_STATUS] !== 200) {
		rej(heads)
		throw heads
	}
	const tx = await dtx(cStr(this, heads))
	// let [, volume, chap, title] = tx.match(rgx.volchtitle)
	// let [, thumb]= tx.match(rgx.thumb)
	// let [, chid] = tx.match(rgx.chapid)
	// let [, pchid]= tx.match(rgx.prchid)
	// let [, nchid]= tx.match(rgx.nxchid)
	// let [, manid]= tx.match(rgx.mangid)
	// let [, hash] = tx.match(rgx.dataurl)
	// let [, parr] = tx.match(rgx.pagearr)
	// let [, serve]= tx.match(rgx.serverm)
	const json_rgx = tx.match(rgx.chapter)
	const j = JSON.parse(json_rgx[2])
	const dataurl = new URL(j.server+j.dataurl+'/', base)
	const pages = j.page_array
	const mdat = {dataurl, lang: j.flag_url, pages, mid: j.manga_id, cid: j.chapter_id, set: Date.now()}
	durl.set(mdat.cid, mdat)
	res(mdat)
	return mdat
}
async function txify(data, res, rej, heads, flags) {
	const data = {heads, data: await dtx(cStr(this, heads))}
	if (heads[HTTP2_HEADER_STATUS] !== 200) {
		rej(data)
		throw data 
	}
	res(data)
	return data
}
async function imagef(data, res, rej, heads, flags) {
	const length = heads[HTTP2_HEADER_CONTENT_LENGTH]
	// if (!heads[HTTP2_HEADER_CONTENT_TYPE].startsWith('image')) {
	// 	rej(heads)
	// 	throw heads
	// }
	const datas = {heads, length, data: cStr(this, heads)}
	res(datas)
	return datas
}


const __req = async (data, onr, server = base, res, rej) => {
	if (server === base) {
		await requestRateLimiter()
		data[HTTP2_HEADER_COOKIE] = COOKIES
	}
	data[HTTP2_HEADER_USER_AGENT] = UA
	data[HTTP2_HEADER_ACCEPT_ENCODING] = ACCEPTENC
	const _ = getConnection(server).request(data)
	_.on('response', onr.bind(_, data, res, rej))
}

const request = (path, onr = txify, server = path.origin || new URL('string' === typeof path ? path : '/', base).origin) => new Promise(__req.bind(
	null,
	('string' === typeof path || path instanceof URL)
		? {[HTTP2_HEADER_PATH]: new URL(path, base).pathname}
		: path
	,
	onr,
	server
))
const getManga = mid => request(`/api/3640f3fb/${mid}`, manga)
const getChapter = cid => request(`/chapter/${cid}`, chapter)
const getFullURLs = async cid => {
	const dURL = durl.get(cid)
	if (dURL && dURL.set < (Date.now()+72*36e5)) {
		return {
			pipe: getConnection(dURL.dataurl),
			pageURLs: dURL.pages.map(x => new URL(x, dURL.dataurl)),
			cid
		}
	}
	const {dataurl, pages} = await getChapter(cid)
	return {
		pipe: getConnection(dataurl),
		pageURLs: pages.map(x => new URL(x, dataurl)),
		cid
	}
}
const wi = (file, length, data) => fopen(file, 'w').then(async fd => {
	await ftrunc(fd, length)
	await fclose(fd)
	return await new Promise(r => {
		data.pipe(fs.createWriteStream(file)).on('close', () => r(file))
	})
})
const ri = (file, url) => request(url, imagef, url.origin).then(({length, data}) => wi(file, length, data))

const getImages = async (fout, iin) => {
	const out = await mkdirp(await fout)
	switch (typeof await iin) {
		case 'object':
			if (Object.hasOwnProperty.call(await iin, 'cid'))
				iin = (await iin).cid
			else throw 'iin is object but not a manga object'
		case 'number':
			const {pageURLs} = await getFullURLs(await iin)
			const a = []
			for (let i = 0; i < pageURLs.length; i++) {
				const ext = path.extname(pageURLs[i].pathname)
				const fname = path.join(await fout, i.toString().padStart(4,'0') + ext)
				a[i] = ri(fname, pageURLs[i])
			}
			return await Promise.all(a)
			break
		case 'string':
			try {
				const s = await lstat(await fout)
				if (s.isDirectory()) {
					const fname = path.join(await fout, path.posix.basename(await iin))
					ri(fname, await iin)
				}
				if (s.isFile()) {
					const fname = path.resolve(await fout)
					await ri(fname, await iin)
				}
			} catch (e) {
				switch (e.code) {
					case 'ENOENT':
						const d = await mkdirp(await fout)
						const fname = path.join(d, path.posix.basename(await iin))
						return await ri(fname, await iin)
					default: throw e
				}
			}
			break
		default: throw 'okwtf'
	}
}

module.exports = {
	request,
	requestRateLimiter,

	getManga,
	getChapter,
	getFullURLs,
	getImages,

	getConnection,
	connections,

	durl,
	limit,
	BACKPRESSURE,

	genres,
	stati,
}


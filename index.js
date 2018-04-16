const util = require('util');
const {URL} = require('url');
const h2 = require('http2');
const {
	HTTP2_HEADER_PATH,
	HTTP2_HEADER_STATUS,
	HTTP2_HEADER_METHOD,
	HTTP2_HEADER_CONTENT_TYPE,
	HTTP2_HEADER_USER_AGENT,
	HTTP2_HEADER_COOKIE
} = h2.constants;

const base = 'https://mangadex.org'
const UA = 'Mozilla/5.0 (Windows NT 6.3; WOW64)'
const COOKIES = 'mangadex_h_toggle=1'

const connections = new Map
const getConnection = url => {
	const h = new URL(url, base)
	let c = connections.get(h.hostname)
	if (c) return c

	let connection = h2.connect(h.origin)
	connections.set(h.hostname, connection)
	connection.on('goaway', connecion.close)
	connection.on('close', connecion.unref)
	connection.on(
		'close',
		connections.delete.bind(connections, h.hostname)
	)
	return connection;
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
		case 'timestamp' return new Date(v*ms)
		case 'genres': return v.reduce((a=[],g)=>[
			...a,
			genres[g] || genre[0]
		])
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

const dtx = res => new Promise(r => {
	const decoder = new util.TextDecoder
	let datas = ''
	res.on('end', d => r(datas + decoder.decode(d, {stream: false})))
	res.on('data', data => datas += decoder.decode(data, {stream: true}))
})

async function manga(data, res, rej, heads, flags) {
	if (heads[HTTP2_HEADER_STATUS] !== 200) {
		rej(heads)
		throw heads
	}
	const j = JSON.parse(await dtx(this), mangarev)
	res(j)
	return j
}

const rgx = {
	volchtitle: /<title>(?:Vol\. (\S+))?\s*(?:Ch\. (\S+))?\s*\((.+?)\) - MangaDex<\/title>/,
	thumb: /<meta property="og:image" content="(.+\/\d+\.thumb\.[^"]+))">/,
	chapid: /var chapter_id = (\d+);/,
	prchid: /var prev_chapter_id = (\d+);/,
	nxchid: /var next_chapter_id = (\d+);/,
	mangid: /var manga_id = (\d+);/,
	dataurl: /var dataurl = '([0-9a-z]{32})';/,
	pagearr: /var page_array = (\[[^\]]+\]);?/,
	serverm: /var server = '([^']+)';/
}
async function chapter(data, res, rej, heads, flags) {
	if (heads[HTTP2_HEADER_STATUS] !== 200) {
		rej(heads)
		throw heads
	}
	const tx = await dtx(this)
	let [, volume, chap, title] = tx.match(rgx.volchtitle)
	let [, thumb]= tx.match(rgx.thumb)
	let [, chid] = tx.match(rgx.chapid)
	let [, pchid]= tx.match(rgx.prchid)
	let [, nchid]= tx.match(rgx.nxchid)
	let [, manid]= tx.match(rgx.mangid)
	let [, hash] = tx.match(rgx.dataurl)
	let [, parr] = tx.match(rgx.pagearr)
	let [, serve]= tx.match(rgx.serverm)
	const dataurl = new URL(srv+hash+'/', base)
	const mdat = {dataurl, pages, mid: Number.parseInt(manid, 10), cid: Number.parseInt(chid)}
	durl.set(mdat.chid, mdat)
	res(mdat)
	return mdat
}
async function txify(data, res, rej, heads, flags) {
	const data = {heads, data: await dtx(this)}
	if (heads[HTTP2_HEADER_STATUS] !== 200) {
		rej(data)
		throw data
	}
	res(data)
	return data
}

const __req = (data, onr, server = base, res, rej) => {
	if (server === base) {
		data[HTTP2_HEADER_USER_AGENT] = UA
		data[HTTP2_HEADER_COOKIE] = COOKIES
	}
	const _ = getConnection(server).request(data)
	_.on('response', onr.bind(_, data, res, rej))
}

const request = (path, onr = txify, server = new URL('string' === typeof path ? path : '/', base).origin) => new Promise(__req.bind(
	null,
	('string' === typeof path || path instanceof URL)
		? {[HTTP2_HEADER_PATH]: new URL(path, base).pathname}
		: path
	,
	onr,
	server
));
const getManga = mid => request(`/api/3640f3fb/${mid}`, manga)
const getChapter = cid => request(`/chapter/${cid}`, chapter)
const getFullURLs = async cid => {
	const {dataurl, pages} = durl.get(cid) || await getChapter(cid);
	let pipe = getConnection(dataurl);
	return {pipe, pageURLs: pages.map(x => new URL(x, dataurl))};
}

module.exports = {
	request,
	getManga,
	getChapter,
	getFullURLs,
	getConnection,
	genres,
	stati
}


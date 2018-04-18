const {getManga, getChapter, getFullURLs, durl, limit, BACKPRESSURE} = require('./index.js')

async function test() {
	let requests = 0
	let start = Date.now()
	let mousou = await getManga(19915)
	requests++
	console.dir(mousou, {colors:true, depth: 1})
	let latest = mousou.chapter.find(({lang}) => lang === 'gb')
	console.dir(mousou, {colors:true})
	console.dir(await getChapter(latest.cid), {colors:true})
	requests++
	let chapters = []
	let i = 0

	let nstart = Date.now()
	for (const {cid} of mousou.chapter) {
		chapters[i++] = getFullURLs(cid).then(p => {
			requests++
			let info = mousou.chapter.find(v => v.cid === cid)
			console.log(
				'v%dc%f (%i) %s: %j\n\t%d/%d; %j',
				info.vol,
				info.ch,
				cid,
				info.timestamp.toGMTString(),
				info.ctitle,
				limit,
				BACKPRESSURE.length,
				p.pageURLs
			)
			console.log((1e3*requests/(Date.now()-nstart)).toFixed(2))
			return p
		}, e => {
			requests++
			console.error(e)
			throw e
		})
	}
	let ch = await Promise.all(chapters)
	console.dir(ch, {colors:true})
	console.dir(await getManga(19915), {colors: true})
	requests++
	let time = Date.now()-start
	console.log('Made %d requests over %ims (%s req/s)', requests, time, (1e3*requests/time).toFixed(2))
}
test().catch(console.error)

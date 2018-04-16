const fs = require('fs')
const os = require('os')
const util = require('util')
const path = require('path')
const readline = require('readline')

const mkdirp = require('zmkdirp')
const md = require('./')

const dn = Date.now() + 7*24*36e5

const opening = 'CREAT|APPEND|NONBLOCK|TRUNC'.split('|').reduce((a,v)=>a|fs.constants['O_' + v], 0)
const [fopen, fclose, fwrite, fappend, faccess] = [fs.open, fs.close, fs.write, fs.appendFile, fs.access].map(util.promisify)

const x = mkdirp(path.join(os.tmpdir(), 'mangadex')).then(async dir => {
	const ch = path.join(dir, 'ch.jsons')
	if (await faccess(ch)) {
		let rl = readline.createInterface({input: fs.createReadStream(ch)})
		let e = new Promise(r=>rl.on('close',r))
		rl.on('line', ln => {
			let j = JSON.parse(ln)
			if (j.set < dn) md.durl.set(j.cid, j)
		})
		await e
	}
	return {ch, dir}
})
const save = async () => {
	let saving = await fopen((await x).ch, opening)
	for (const [cid, data] of md.durl) if (data.set < dn)
		await fappend(saving, JSON.stringify(data) + '\n')
	await fclose(saving)
	return true
}
module.exports = {
	save,
}
x.then(({ch, dir}) => {module.exports.ch = ch; module.exports.dir = dir})

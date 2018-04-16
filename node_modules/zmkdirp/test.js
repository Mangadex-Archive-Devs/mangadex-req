
const {mkdirp, mkdirpSync} = require('./')

async function myDir () {
	// other stuff
	return await mkdirp('mydir')
}

function mydirSync () {
	// other stuff
	return mkdirpSync('mydir')
}

// make a folder that only you can access or change
const priv = (p = 'private') => mkdirp(p, 0o1700, true) 
// only owner or root can delete in *nix

let {lstat} = require('fs')
// chmod if exists:
Promise.all([
	mkdirp('ok', 0o1600).then(k => mkdirp(k, 0o777, true)),
	myDir(),
	priv()
]).then(a => a.forEach(ok => lstat(ok, (err, stat) => err ? console.error(err) : console.log('mode %s (uid %d:gid %d) : %s', stat.mode.toString(8).padStart(5,'0'), stat.uid, stat.gid, ok))))


# zmkdirp

Roughly the same as package mkdirp.

Usage: `mkdirp(path, mode, chmodIfExists)`

Returns: created path

```javascript
const {mkdirp, mkdirpSync} = require('zmkdirp')

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

// chmod if exists:

mkdirp('ok').then(k => mkdirp(k, 0o777, true)).then(v => require('fs').lstat(v, (err, stat) => err ? console.error(err) :  (console.log('mode:', stat.mode.toString(8)),console.log(stat)))).catch(console.error)

```


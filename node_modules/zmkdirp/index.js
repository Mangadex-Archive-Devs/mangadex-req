const [{promisify},fs,{resolve, dirname}, {tmpdir}] = 'util,fs,path,os'.split(',').map(v=>require(v.trim()))
const [mkdir, /*mkdirtmp,*/ chmod] = [fs.mkdir, /*fs.mkdtemp,*/ fs.chmod].map(promisify)

const stmp = new Set(['tmp','temp'].map(Symbol.for))
/**
 * @function rP
 * @sync
 * @arg {string|array<symbol,...string|string>|buffer|URL} p path to resolve
 */
const rP = p => Array.isArray(p)
	? (Buffer.isBuffer(p) ? p : (
		stmp.has(p[0]) 
		? resolve(tmpdir(), ...p.slice(1))
		: resolve(...p)
	))
	: 'string' === typeof p ? resolve(p) : p
;

/**
 * @function mkdirp
 * @async
 * @param {string|array<string>|buffer|URL} p - path to create
 * @param {undefined|number} m - mode to create path
 * @param {undefined|boolean} c - chmod path if resoved p exists
 * @returns {Promise<string>} resolved path
 */
const mkdirp = (p, m = 0o777 - process.umask(), c = false) => {
	const P = rP(p)
	return mkdir(P, m)
		.then(()=>P)
		.catch(async function mkerr (e) {
			switch (e.code) {
				case 'ENOENT':
					await mkdirp(dirname(P), m, c)
					await mkdirp(P, m, c)
					return P
				case 'EEXIST':
					if (c) await chmod(P, m)
					return P
				default: throw e
			}
		})
}

/**
 * @function mkdirps
 * @sync
 * @param {string|array<string>|buffer|URL} p - path to create
 * @param {undefined|number} m - mode to create path
 * @param {undefined|boolean} c - chmod path if resoved p exists
 * @returns {string} resolved path
 */
const mkdirps = (p, m = 0o777 - process.umask(), c = false) => {
	const P = rP(p)
	try {
		fs.mkdirSync(P, m)
		return P
	} catch (e) {
		switch (e.code) {
			case 'ENOENT':
				mkdirps(dirname(P), m, c)
				mkdirps(P, m, c)
				return P
			case 'EEXIST':
				if (c) fs.chmodSync(P, m)
				return P
			default: throw e
		}
	}
}


module.exports = exports = mkdirp
exports.mkdirp = mkdirp
exports.mkdirps = mkdirps
exports.mkdirpSync = mkdirps



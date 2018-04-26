# mangadex-req

## Usage

```javascript
const {request, getManga, getChapter, getFullURLs, getConnection} = require('mangadex-req')
```

### `request(path, onResponse[, server])`

* `path`: `<string>` | `<URL>` | `<Object>`. Default `'/'`. Passed to `http2session.request`. Using `<string>` and `<URL>` types means different servers only need specification in the path.
* `onResponse`: `<function>` to call on the body, where `this` refers to the connection itself, and the arguments are `requestData, resolve, reject, headers, flags`. Default returns `{heads, data}` where `data` is a string.
* `server`: `<string>` | `<URL>`. Defaults to `new URL(path, 'https://mangadex.org').origin` if `path` is a `string`, `new URL('/', 'https://mangadex.org').origin` otherwise.

Returns `Promise<res, rej>`

### `getManga(mid)`

* `mid`: `<number>` | `<string>` manga to retrieve data of.

Returns `Promise<json, heads>`

### `getChapter(cid)`

* `cid`: `<number>` | `<string>` chapter to retrieve data of.

Returns `Promise<json, heads>`

### `getFullURLs(cid)`

* `cid`: `<number>` | `<string>` chapter to retrieve pages of.

Returns `Promise<{pipe, pageURLs, cid}, err>`

### `getImages(fout, iin)`

* `fout`: `<string>` directory to put images into
* `iin`: `<number>` | `<Object{cid}>` cid to request

### `getConnection(service)`

* `service`: `<string>` | `<URL>` to connect to.



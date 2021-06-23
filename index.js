const bint = require('bint8array')
const assert = require('nanoassert')

module.exports.Writer = class Writer {
  constructor (buf, offset = 0) {
    this.buf = buf || new Uint8Array(256)
    this.offset = offset

    this.startIndex = offset
    this.finalized = false
    this.bytesWritten = 0

    this.allocated = !!buf
  }

  write (data) {
    this._realloc(data.byteLength)
    this.buf.set(data, this.offset)
    this.offset += data.byteLength
    return this
  }

  skip (bytes) {
    this._realloc(bytes)

    this.offset += bytes
    return this
  }

  bytes (data, len) {
    if (typeof data === 'string') return this.hex(data, len)

    if (!len) this.prefix(data.byteLength)
    this.write(data)

    return this
  }

  bool (bool) {
    this._realloc(1)

    this.buf[this.offset++] = bool ? 1 : 0
    return this
  }

  hex (str, len) {
    if (str instanceof Uint8Array) return this.bytes(str, len)

    if (!len) this.prefix(Math.ceil(str.length / 2))
    this.write(bint.fromString(str, 'hex'))

    return this
  }

  string (str, enc) {
    this.prefix(str.length)
    this.write(bint.fromString(str, enc))

    return this
  }

  array (arr, encoder, ...opts) {
    encoder = encoder.bind(this)
    this.prefix(arr.length)
    for (const entry of arr) encoder(entry, ...opts)

    return this
  }

  prefix (num) {
    if (num < 0xfe) {
      this._realloc(1)
      this.buf[this.offset++] = num
    } else if (num <= 0xffff) {
      this._realloc(3)
      this.buf[this.offset++] = 0xfe
      this.buf[this.offset++] = num
      this.buf[this.offset++] = num >> 8
    } else if (num < 0xffffffff) {
      this._realloc(5)
      this.buf[this.offset++] = 0xff
      this.buf[this.offset++] = num
      this.buf[this.offset++] = num >> 8
      this.buf[this.offset++] = num >> 16
      this.buf[this.offset++] = num >> 24
    } else {
      throw new Error('prefix too large')
    }

    return this
  }

  final () {
    this.finalized = true
    this.bytesWritten = this.offset - this.startIndex
    this.buf = this.buf.subarray(this.startIndex, this.offset)

    return this.buf
  }

  _realloc (bytes) {
    const overflow = bytes + this.offset - this.buf.byteLength

    if (overflow <= 0) return

    let size = this.buf.byteLength
    while (size < overflow << 2) {
      size <<= 2
    }

    const buf = new Uint8Array(size)
    buf.set(this.buf)

    this.buf = buf
  }
}

module.exports.Reader = class Reader {
  constructor (buf, offset) {
    this.buf = buf
    this.offset = offset || 0
    this.startIndex = offset || 0
    this.finalized = false
  }

  read (bytes, buf) {
    if (!bytes) return this.buf.subarray(this.offset)
    if (!buf) buf = new Uint8Array(bytes)
    const end = bytes ? this.offset + bytes : null

    buf.set(this.buf.subarray(this.offset, end))
    this.offset += bytes

    return buf
  }

  skip (bytes) {
    this.offset += bytes
    return this
  }

  bytes (len) {
    if (!len) len = this.prefix()
    return this.read(len)
  }

  bool () {
    const bool = this.buf[this.offset++]
    assert((bool & 1) === bool, 'Boolean should be encoded as 0 or 1')

    return bool === 1
  }

  flag () {
    return this.buf[this.offset++]
  }

  prefix () {
    let num = this.buf[this.offset++]

    if (num > 0xfd) {
      num += this.buf[this.offset++] << 8
    }

    if (num > 0xfe) {
      num += this.buf[this.offset++] << 24
      num += this.buf[this.offset++] << 16
    }

    return num
  }

  hex (len) {
    if (!len) len = this.prefix()
    const slice = this.read(len)

    return bint.toString(slice, 'hex')
  }

  string (enc) {
    const len = this.prefix()
    const slice = this.read(len)

    return bint.toString(slice, enc)
  }

  array (decoder, ...opts) {
    decoder = decoder.bind(this)
    const arr = []

    const len = this.prefix()
    for (let i = 0; i < len; i++) {
      arr.push(decoder(...opts))
    }

    return arr
  }

  bytesRead () {
    return this.offset - this.startIndex
  }

  final () {
    this.finalized = false
    return this.bytesRead()
  }
}

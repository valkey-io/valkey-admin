import { describe, it } from "node:test"
import assert from "node:assert"
import { deflateSync, gzipSync, constants } from "node:zlib"
import { randomBytes } from "node:crypto"
import { detectCompressionCodec, parseGlideHeader } from "../compression"

const text = (s: string) => new TextEncoder().encode(s)
const bytes = (...values: number[]) => Uint8Array.from(values)
const payload = text("hello hello hello hello hello")
// `zstd -c` of the payload above; node:zlib's zstd support needs Node 22.15+, so the bytes are inlined.
const zstdPayload = Uint8Array.from(Buffer.from("28b52ffd04586500003068656c6c6f200100a94b11874e200a", "hex"))

describe("detectCompressionCodec", () => {
  it("detects gzip", () => {
    assert.strictEqual(detectCompressionCodec(gzipSync(payload)), "gzip")
  })

  it("detects zlib at every compression level", () => {
    for (let level = 0; level <= 9; level++) {
      assert.strictEqual(detectCompressionCodec(deflateSync(payload, { level })), "zlib", `level ${level}`)
    }
  })

  it("detects zstd", () => {
    assert.strictEqual(detectCompressionCodec(zstdPayload), "zstd")
  })

  it("detects an LZ4 frame", () => {
    assert.strictEqual(detectCompressionCodec(bytes(0x04, 0x22, 0x4d, 0x18, 0x64, 0x40, 0xa7)), "lz4-frame")
  })

  it("detects a Snappy framed stream", () => {
    const identifier = bytes(0xff, 0x06, 0x00, 0x00, 0x73, 0x4e, 0x61, 0x50, 0x70, 0x59)
    assert.strictEqual(detectCompressionCodec(identifier), "snappy-framed")
  })

  it("detects GLIDE headers ahead of the inner format", () => {
    assert.strictEqual(detectCompressionCodec(Uint8Array.from([0, 1, 2, 0, 1, ...zstdPayload])), "glide-zstd")
    assert.strictEqual(detectCompressionCodec(bytes(0, 1, 2, 0, 2, 5, 0, 0, 0, 0x50)), "glide-lz4")
  })

  it("does not detect formats without a signature or with too few bytes", () => {
    for (const input of [bytes(), bytes(0x1f), bytes(0x1f, 0x8b), bytes(0x28, 0xb5, 0x2f), bytes(0x78, 0x9c), bytes(0, 1, 2, 0, 1)]) {
      assert.strictEqual(detectCompressionCodec(input), undefined, Buffer.from(input).toString("hex"))
    }
  })

  it("does not treat plain text starting with x as zlib", () => {
    for (const s of ["xylophone", "x", "xx", "x1", "xml version", "x=1&y=2", "xyz"]) {
      assert.strictEqual(detectCompressionCodec(text(s)), undefined, s)
    }
  })

  it("rejects zlib headers that need a preset dictionary", () => {
    const withDictionary = deflateSync(payload, { dictionary: text("hello") })
    assert.strictEqual(withDictionary[1] & 0x20, 0x20)
    assert.strictEqual(detectCompressionCodec(withDictionary), undefined)
  })

  it("rejects gzip magic with a compression method other than deflate", () => {
    assert.strictEqual(detectCompressionCodec(bytes(0x1f, 0x8b, 0x07, 0x00)), undefined)
  })

  it("rarely matches random bytes", () => {
    // A 0x78 first byte with a valid check is the weakest signature: about 1 in 8000 random inputs.
    let matches = 0
    for (let i = 0; i < 20000; i++) {
      if (detectCompressionCodec(randomBytes(32)) !== undefined) matches++
    }
    assert.ok(matches < 20, `${matches} random inputs detected`)
  })

  it("does not detect plain JSON", () => {
    assert.strictEqual(detectCompressionCodec(text(JSON.stringify({ a: 1 }))), undefined)
  })

  it("ignores zlib strategy constants that change only the second byte", () => {
    const huffmanOnly = deflateSync(payload, { strategy: constants.Z_HUFFMAN_ONLY })
    assert.strictEqual(detectCompressionCodec(huffmanOnly), "zlib")
  })
})

describe("parseGlideHeader", () => {
  it("reads version and backend", () => {
    assert.deepStrictEqual(parseGlideHeader(bytes(0, 1, 2, 0, 1, 0x28)), { version: 0, backend: "zstd" })
    assert.deepStrictEqual(parseGlideHeader(bytes(0, 1, 2, 0, 2, 0x00)), { version: 0, backend: "lz4" })
  })

  it("returns unknown versions so callers can reject them", () => {
    assert.deepStrictEqual(parseGlideHeader(bytes(0, 1, 2, 7, 1, 0x28)), { version: 7, backend: "zstd" })
  })

  it("rejects unknown backends, wrong magic and header-only values", () => {
    assert.strictEqual(parseGlideHeader(bytes(0, 1, 2, 0, 3, 0x28)), undefined)
    assert.strictEqual(parseGlideHeader(bytes(0, 1, 3, 0, 1, 0x28)), undefined)
    assert.strictEqual(parseGlideHeader(bytes(0, 1, 2, 0, 1)), undefined)
  })
})

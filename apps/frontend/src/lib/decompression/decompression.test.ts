import { readFileSync } from "node:fs"
import path from "node:path"
import { gunzipSync } from "node:zlib"
import { describe, expect, it } from "vitest"
import { COMPRESSION_CODECS, type CompressionCodec } from "@common/src/compression"
import { ByteWriter } from "./byte-writer"
import { base64ToBytes, decompress, type DecompressOutcome } from "./index"
import { renderDecompressed } from "./render"

const fixture = (name: string) => new Uint8Array(readFileSync(path.join(__dirname, "__fixtures__", name)))
const sampleJson = fixture("sample.json")
const largeText = new Uint8Array(gunzipSync(fixture("large.txt.gz")))
const MiB = 1024 * 1024

const run = (input: Uint8Array, codec: CompressionCodec, maxOutputBytes = 10 * MiB) =>
  decompress(input, codec, { maxOutputBytes })

function expectDecoded(outcome: DecompressOutcome): Extract<DecompressOutcome, { kind: "decoded" }> {
  if (outcome.kind !== "decoded") throw new Error(`expected decoded, got ${JSON.stringify(outcome)}`)
  return outcome
}

// Deterministic PRNG so fuzz failures can be reproduced.
function prng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 2 ** 32
  }
}

const varint = (value: number) => {
  const bytes: number[] = []
  while (value >= 0x80) {
    bytes.push((value & 0x7f) | 0x80)
    value = Math.floor(value / 128)
  }
  bytes.push(value)
  return bytes
}

describe("decompress: reference fixtures", () => {
  const cases: [string, CompressionCodec, Uint8Array][] = [
    ["sample.json.gz", "gzip", sampleJson],
    ["sample.json.zlib", "zlib", sampleJson],
    ["sample.json.zst", "zstd", sampleJson],
    ["sample.json.lz4", "lz4-frame", sampleJson],
    ["large.txt.linked.lz4", "lz4-frame", largeText],
    ["large.txt.independent.lz4", "lz4-frame", largeText],
    ["sample.json.lz4block", "lz4-block", sampleJson],
    ["sample.json.snappy", "snappy-raw", sampleJson],
    ["large.txt.sz", "snappy-framed", largeText],
    ["sample.json.glide-zstd", "glide-zstd", sampleJson],
    ["sample.json.glide-lz4", "glide-lz4", sampleJson],
    ["large.txt.gz", "gzip", largeText],
  ]

  it.each(cases)("%s decodes as %s", async (name, codec, expected) => {
    const result = expectDecoded(await run(fixture(name), codec))
    expect(result.truncated).toBe(false)
    expect(Buffer.from(result.output).equals(Buffer.from(expected))).toBe(true)
  })

  it("reports the declared size from LZ4 frame headers and GLIDE LZ4", async () => {
    expect(expectDecoded(await run(fixture("large.txt.linked.lz4"), "lz4-frame")).declaredSize).toBe(largeText.length)
    expect(expectDecoded(await run(fixture("sample.json.glide-lz4"), "glide-lz4")).declaredSize).toBe(sampleJson.length)
  })

  it("decodes multi-member gzip", async () => {
    const twice = new Uint8Array([...fixture("sample.json.gz"), ...fixture("sample.json.gz")])
    expect(expectDecoded(await run(twice, "gzip")).output.length).toBe(sampleJson.length * 2)
  })
})

describe("decompress: output limit", () => {
  it.each([["bomb.gz", "gzip"], ["bomb.zst", "zstd"]] as const)("stops %s at the limit", async (name, codec) => {
    const result = expectDecoded(await run(fixture(name), codec, 10 * MiB))
    expect(result.truncated).toBe(true)
    expect(result.output.length).toBe(10 * MiB)
    expect(result.output.every((byte) => byte === 0)).toBe(true)
  })

  it("truncates each codec at a small limit", async () => {
    for (const [name, codec] of [
      ["large.txt.linked.lz4", "lz4-frame"], ["large.txt.sz", "snappy-framed"], ["sample.json.snappy", "snappy-raw"],
      ["sample.json.lz4block", "lz4-block"], ["sample.json.glide-lz4", "glide-lz4"], ["sample.json.glide-zstd", "glide-zstd"],
      ["sample.json.zlib", "zlib"],
    ] as const) {
      const result = expectDecoded(await run(fixture(name), codec, 1000))
      expect(result.truncated, name).toBe(true)
      expect(result.output.length, name).toBe(1000)
      const expected = (name.startsWith("large") ? largeText : sampleJson).subarray(0, 1000)
      expect(Buffer.from(result.output).equals(Buffer.from(expected)), name).toBe(true)
    }
  })

  it("does not truncate output that exactly fits", async () => {
    const result = expectDecoded(await run(fixture("sample.json.zst"), "zstd", sampleJson.length))
    expect(result.truncated).toBe(false)
  })

  it("keeps a raw Snappy value's declared size when it is cut off", async () => {
    // One literal byte, then 32768 copies of 64 bytes at offset 1: a 2 MiB run from a few KiB.
    const copies = 32768
    const declared = 1 + 64 * copies
    const input = [...varint(declared), 0x00, 0x61]
    for (let i = 0; i < copies; i++) input.push(0xfe, 0x01, 0x00)
    const result = expectDecoded(await run(Uint8Array.from(input), "snappy-raw", MiB))
    expect(result.truncated).toBe(true)
    expect(result.declaredSize).toBe(declared)
    expect(result.output.length).toBe(MiB)
  })
})

describe("decompress: malformed input", () => {
  const fixtures: [string, CompressionCodec][] = [
    ["sample.json.gz", "gzip"], ["sample.json.zlib", "zlib"], ["sample.json.zst", "zstd"],
    ["sample.json.lz4", "lz4-frame"], ["large.txt.sz", "snappy-framed"], ["sample.json.snappy", "snappy-raw"],
    ["sample.json.glide-zstd", "glide-zstd"], ["sample.json.glide-lz4", "glide-lz4"],
  ]

  it.each(fixtures)("rejects truncated %s with a clear error", async (name, codec) => {
    const bytes = fixture(name)
    const outcome = await run(bytes.subarray(0, Math.floor(bytes.length / 2)), codec)
    expect(outcome.kind).toBe("failed")
    if (outcome.kind === "failed") expect(outcome.error).toMatch(/^Not valid .+ data: /)
  })

  it.each(COMPRESSION_CODECS)("rejects empty input as %s", async (codec) => {
    expect((await run(new Uint8Array(), codec)).kind).toBe("failed")
  })

  it("rejects data in the wrong format", async () => {
    const outcome = await run(fixture("sample.json.gz"), "zstd")
    expect(outcome).toEqual({ kind: "failed", error: expect.stringMatching(/^Not valid zstd data: /) })
    expect((await run(fixture("sample.json.zst"), "lz4-frame"))).toEqual({
      kind: "failed", error: "Not valid LZ4 frame data: missing LZ4 frame magic number.",
    })
  })

  it("rejects LZ4 matches that reach before the output", async () => {
    // Token: 1 literal, match length 4; literal "a"; offset 5 although only 1 byte exists.
    const outcome = await run(Uint8Array.from([0x10, 0x61, 0x05, 0x00]), "lz4-block")
    expect(outcome).toEqual({
      kind: "failed", error: "Not valid LZ4 raw block data: match at byte 2 references data before the start of the output (offset 5).",
    })
  })

  it("rejects Snappy copies that reach before the output", async () => {
    const outcome = await run(Uint8Array.from([...varint(10), 0x00, 0x61, 0x01, 0x09]), "snappy-raw")
    expect(outcome.kind === "failed" && outcome.error).toMatch(/references data before the start of the output/)
  })

  it("rejects raw Snappy that decodes past its declared length", async () => {
    const outcome = await run(Uint8Array.from([...varint(2), 0x08, 0x61, 0x62, 0x63]), "snappy-raw")
    expect(outcome.kind === "failed" && outcome.error).toMatch(/past the declared length of 2 bytes/)
  })

  it("rejects GLIDE headers it doesn't know", async () => {
    const input = fixture("sample.json.glide-zstd").slice()
    input[3] = 1
    expect(await run(input, "glide-zstd")).toEqual({
      kind: "failed", error: "Not valid GLIDE zstd data: unsupported GLIDE compression format version 1.",
    })
    expect((await run(fixture("sample.json.glide-zstd"), "glide-lz4")).kind).toBe("failed")
  })

  it("rejects a GLIDE LZ4 value whose declared size doesn't match", async () => {
    const input = fixture("sample.json.glide-lz4").slice()
    input.set([0xff, 0xff, 0xff, 0xff], 5)
    const outcome = await run(input, "glide-lz4")
    expect(outcome.kind === "failed" && outcome.error).toMatch(/header declares 4294967295/)
  })
})

describe("decompress: fuzz", () => {
  const signatures: Partial<Record<CompressionCodec, number[]>> = {
    gzip: [0x1f, 0x8b, 0x08], zlib: [0x78, 0x9c], zstd: [0x28, 0xb5, 0x2f, 0xfd],
    "lz4-frame": [0x04, 0x22, 0x4d, 0x18, 0x64, 0x40, 0xa7],
    "snappy-framed": [0xff, 0x06, 0x00, 0x00, 0x73, 0x4e, 0x61, 0x50, 0x70, 0x59],
    "glide-zstd": [0, 1, 2, 0, 1, 0x28, 0xb5, 0x2f, 0xfd], "glide-lz4": [0, 1, 2, 0, 2],
  }

  it.each(COMPRESSION_CODECS)("%s returns or fails cleanly on random input", async (codec) => {
    const random = prng(codec.length * 7919)
    for (let i = 0; i < 300; i++) {
      const body = Array.from({ length: Math.floor(random() * 256) }, () => Math.floor(random() * 256))
      const input = Uint8Array.from([...(signatures[codec] ?? []), ...body])
      const outcome = await run(input, codec, 64 * 1024)
      expect(["decoded", "failed"]).toContain(outcome.kind)
      if (outcome.kind === "decoded") expect(outcome.output.length).toBeLessThanOrEqual(64 * 1024)
    }
  })

  it.each([
    ["sample.json.gz", "gzip"], ["sample.json.zst", "zstd"], ["sample.json.lz4", "lz4-frame"],
    ["sample.json.lz4block", "lz4-block"], ["sample.json.snappy", "snappy-raw"], ["sample.json.glide-lz4", "glide-lz4"],
  ] as const)("%s returns or fails cleanly at every truncation and with flipped bytes", async (name, codec) => {
    const bytes = fixture(name)
    const random = prng(bytes.length)
    for (let length = 0; length < bytes.length; length++) {
      const outcome = await run(bytes.subarray(0, length), codec, 64 * 1024)
      expect(["decoded", "failed"]).toContain(outcome.kind)
    }
    for (let i = 0; i < 200; i++) {
      const corrupted = bytes.slice()
      corrupted[Math.floor(random() * corrupted.length)] ^= 1 << Math.floor(random() * 8)
      const outcome = await run(corrupted, codec, 64 * 1024)
      expect(["decoded", "failed"]).toContain(outcome.kind)
      if (outcome.kind === "decoded") expect(outcome.output.length).toBeLessThanOrEqual(64 * 1024)
    }
  })
})

describe("decompress: cancellation", () => {
  it("returns cancelled when aborted", async () => {
    const controller = new AbortController()
    controller.abort()
    expect(await decompress(fixture("bomb.zst"), "zstd", { maxOutputBytes: 10 * MiB, signal: controller.signal }))
      .toEqual({ kind: "cancelled" })
  })
})

describe("ByteWriter", () => {
  it("repeats overlapping matches", () => {
    const out = new ByteWriter(100)
    out.write(Uint8Array.from([1, 2, 3]))
    out.copyMatch(3, 10)
    out.copyMatch(1, 3)
    expect(Array.from(out.bytes())).toEqual([1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 1, 1, 1])
  })

  it("keeps what fits under the limit", () => {
    const out = new ByteWriter(4)
    expect(out.write(Uint8Array.from([1, 2, 3]))).toBe(true)
    expect(out.copyMatch(1, 5)).toBe(false)
    expect(Array.from(out.bytes())).toEqual([1, 2, 3, 3])
    expect(out.truncated).toBe(true)
  })
})

describe("renderDecompressed", () => {
  const encode = (s: string) => new TextEncoder().encode(s)

  it("pretty-prints complete JSON", () => {
    expect(renderDecompressed(encode("{\"a\":[1]}"), { truncated: false, previewMaxBytes: MiB }))
      .toEqual({ view: "json", preview: "{\n  \"a\": [\n    1\n  ]\n}", previewStart: 0, previewBytes: 9, previewTruncated: false })
  })

  it("shows truncated JSON as text, accepting a character cut in half", () => {
    const cut = encode("[\"café\"]").subarray(0, 6)
    expect(renderDecompressed(cut, { truncated: true, previewMaxBytes: MiB }))
      .toEqual({ view: "text", preview: "[\"caf", previewStart: 0, previewBytes: 5, previewTruncated: true })
  })

  it("falls back to text when pretty-printed JSON exceeds the preview limit", () => {
    // 21 bytes compact, 41 bytes pretty-printed.
    const compact = encode(JSON.stringify({ a: [1, 2, 3], b: 4 }))
    expect(renderDecompressed(compact, { truncated: false, previewMaxBytes: 30 }))
      .toMatchObject({ view: "text", preview: "{\"a\":[1,2,3],\"b\":4}", previewTruncated: false })
  })

  it("limits text by UTF-8 bytes and cuts on a character boundary", () => {
    // Each "é" is 2 bytes, so 7 bytes hold 3 whole characters.
    const result = renderDecompressed(encode("éééééé"), { truncated: false, previewMaxBytes: 7 })
    expect(result).toEqual({ view: "text", preview: "ééé", previewStart: 0, previewBytes: 6, previewTruncated: true })
  })

  it("starts the preview at previewStart, on the next character boundary", () => {
    // Byte 1 is the second byte of the first "é".
    const result = renderDecompressed(encode("ééab"), { truncated: false, previewMaxBytes: 100, previewStart: 1 })
    expect(result).toEqual({ view: "text", preview: "éab", previewStart: 2, previewBytes: 4, previewTruncated: true })
  })

  it("starts a hex preview at previewStart with absolute offsets", () => {
    const result = renderDecompressed(new Uint8Array(100), { truncated: true, previewMaxBytes: 80, previewStart: 32 })
    expect(result).toMatchObject({ view: "hex", previewStart: 32, previewBytes: 16, previewTruncated: true })
    expect(result.preview).toBe("00000020  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  |................|")
  })

  it("keeps a hex preview with a partial last line within the preview limit", () => {
    // One full 77-character line, a newline, then a 61-character line with 6 bytes.
    const result = renderDecompressed(new Uint8Array(100), { truncated: false, previewMaxBytes: 145 })
    expect(result).toMatchObject({ view: "hex", previewStart: 0, previewBytes: 22, previewTruncated: true })
    expect(result.preview.split("\n")[1]).toBe("00000010  00 00 00 00 00 00                                |......|")
    expect(result.preview.length).toBe(145)
    expect(renderDecompressed(new Uint8Array(100), { truncated: false, previewMaxBytes: 144 }).previewBytes).toBe(21)
  })

  it("shows plain text and JSON-looking scalars as text", () => {
    expect(renderDecompressed(encode("true"), { truncated: false, previewMaxBytes: MiB }).view).toBe("text")
    expect(renderDecompressed(encode("hello"), { truncated: false, previewMaxBytes: MiB }).view).toBe("text")
  })

  it("limits text to the preview size and skips JSON parsing beyond it", () => {
    const result = renderDecompressed(encode(`[${"1,".repeat(100)}1]`), { truncated: false, previewMaxBytes: 50 })
    expect(result).toMatchObject({ view: "text", previewTruncated: true, previewBytes: 50 })
    expect(result.preview).toHaveLength(50)
  })

  it("shows valid UTF-8 with control characters, such as zeros, as a hex dump", () => {
    const result = renderDecompressed(new Uint8Array(64), { truncated: true, previewMaxBytes: 1000 })
    expect(result.view).toBe("hex")
    expect(result.preview.split("\n")[0]).toBe("00000000  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  |................|")
    expect(renderDecompressed(encode("a\tb\r\nc\f"), { truncated: false, previewMaxBytes: 1000 }).view).toBe("text")
  })

  it("shows invalid UTF-8 as a hex dump", () => {
    const result = renderDecompressed(fixture("binary.bin"), { truncated: false, previewMaxBytes: 160 })
    expect(result.view).toBe("hex")
    expect(result.preview.split("\n")[0]).toBe("00000000  ff fe 00 80 ff fe 00 80 ff fe 00 80 ff fe 00 80  |................|")
    expect(result.preview.split("\n")).toHaveLength(2)
    expect(result.previewTruncated).toBe(true)
    expect(result.previewBytes).toBe(32)
  })
})

describe("base64ToBytes", () => {
  it("round-trips bytes", () => {
    const bytes = fixture("sample.json.zst")
    expect(Buffer.from(base64ToBytes(Buffer.from(bytes).toString("base64"))).equals(Buffer.from(bytes))).toBe(true)
  })
})

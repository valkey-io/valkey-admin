/**
 * Compression formats the Key Browser can decode, and signature detection for them.
 * Detection only looks at leading bytes: it is a hint, and decoding is what proves the format.
 */
export const COMPRESSION_CODECS = [
  "gzip",
  "zlib",
  "zstd",
  "lz4-frame",
  "lz4-block",
  "snappy-framed",
  "snappy-raw",
  "glide-zstd",
  "glide-lz4",
] as const

export type CompressionCodec = typeof COMPRESSION_CODECS[number]

export const COMPRESSION_CODEC_LABELS: Record<CompressionCodec, string> = {
  gzip: "gzip",
  zlib: "zlib",
  zstd: "zstd",
  "lz4-frame": "LZ4 frame",
  "lz4-block": "LZ4 raw block",
  "snappy-framed": "Snappy framed",
  "snappy-raw": "Snappy raw",
  "glide-zstd": "GLIDE zstd",
  "glide-lz4": "GLIDE LZ4",
}

/**
 * GLIDE automatic compression header (glide-core/src/compression.rs, GLIDE 2.4+):
 * 3 magic bytes, 1 version byte, 1 backend byte. zstd is followed by a zstd frame;
 * lz4 by a 4-byte little-endian original size and a raw LZ4 block.
 */
export const GLIDE_MAGIC_PREFIX = [0x00, 0x01, 0x02] as const
export const GLIDE_HEADER_SIZE = 5
export const GLIDE_SUPPORTED_VERSION = 0x00
const GLIDE_BACKENDS: Record<number, "zstd" | "lz4"> = { 0x01: "zstd", 0x02: "lz4" }

export type GlideHeader = { version: number; backend: "zstd" | "lz4" }

/**
 * Bytes needed to detect every supported signature; the server probes this many for the passive hint.
 */
export const COMPRESSION_SIGNATURE_PROBE_BYTES = 16

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd]
const LZ4_FRAME_MAGIC = [0x04, 0x22, 0x4d, 0x18]
const SNAPPY_STREAM_IDENTIFIER = [0xff, 0x06, 0x00, 0x00, 0x73, 0x4e, 0x61, 0x50, 0x70, 0x59]
// 0x1f 0x8b plus compression method 8 (deflate), the only method in use
const GZIP_MAGIC = [0x1f, 0x8b, 0x08]

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return bytes.length >= signature.length && signature.every((byte, i) => bytes[i] === byte)
}

/**
 * Reads a GLIDE compression header. The version is returned as found, so callers can reject versions they don't know.
 * GLIDE never compresses values smaller than header + 1 bytes.
 */
export function parseGlideHeader(bytes: Uint8Array): GlideHeader | undefined {
  if (bytes.length <= GLIDE_HEADER_SIZE || !startsWith(bytes, GLIDE_MAGIC_PREFIX)) return undefined
  const backend = GLIDE_BACKENDS[bytes[4]]
  return backend ? { version: bytes[3], backend } : undefined
}

/**
 * zlib header: CM 8 (deflate) with a 32K window is always 0x78, the 16-bit header is a multiple of 31,
 * and preset dictionaries (FDICT) aren't supported. This check is weak: text starting with "x^" passes.
 */
function isZlibHeader(bytes: Uint8Array): boolean {
  if (bytes.length < 3 || bytes[0] !== 0x78) return false
  const hasPresetDictionary = (bytes[1] & 0x20) !== 0
  return ((bytes[0] << 8) | bytes[1]) % 31 === 0 && !hasPresetDictionary
}

/**
 * Guesses the codec from leading bytes, most specific signature first. Raw LZ4 blocks and raw Snappy
 * have no signature, so they are never detected and can only be chosen by hand.
 */
export function detectCompressionCodec(bytes: Uint8Array): CompressionCodec | undefined {
  const glide = parseGlideHeader(bytes)
  if (glide) return glide.backend === "zstd" ? "glide-zstd" : "glide-lz4"
  if (startsWith(bytes, SNAPPY_STREAM_IDENTIFIER)) return "snappy-framed"
  if (startsWith(bytes, ZSTD_MAGIC)) return "zstd"
  if (startsWith(bytes, LZ4_FRAME_MAGIC)) return "lz4-frame"
  if (startsWith(bytes, GZIP_MAGIC)) return "gzip"
  if (isZlibHeader(bytes)) return "zlib"
  return undefined
}

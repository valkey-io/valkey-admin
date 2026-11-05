import { COMPRESSION_CODEC_LABELS, type CompressionCodec } from "@common/src/compression"
import { ByteWriter, type Decoder, DecodeError } from "./byte-writer"

export type DecompressOutcome =
  | { kind: "decoded"; output: Uint8Array; truncated: boolean; declaredSize?: number }
  | { kind: "failed"; error: string }
  | { kind: "cancelled" }

// Each decoder loads on first use, in its own chunk.
const decoderLoaders: Record<CompressionCodec, () => Promise<Decoder>> = {
  gzip: async () => (await import("./flate")).decodeGzip,
  zlib: async () => (await import("./flate")).decodeZlib,
  zstd: async () => (await import("./zstd")).decodeZstd,
  "lz4-frame": async () => (await import("./lz4")).decodeLz4Frames,
  "lz4-block": async () => (await import("./lz4")).decodeLz4RawBlock,
  "snappy-framed": async () => (await import("./snappy")).decodeSnappyFramed,
  "snappy-raw": async () => (await import("./snappy")).decodeSnappyRaw,
  "glide-zstd": async () => {
    const [{ createGlideZstdDecoder }, { decodeZstd }] = await Promise.all([import("./glide"), import("./zstd")])
    return createGlideZstdDecoder(decodeZstd)
  },
  "glide-lz4": async () => (await import("./glide")).decodeGlideLz4,
}

// Longest stretch of decoding between yields to the UI.
const TIME_SLICE_MS = 12

type Scheduler = { yield?: () => Promise<void> }

const yieldToMain = (): Promise<void> => {
  const scheduler = (globalThis as { scheduler?: Scheduler }).scheduler
  return scheduler?.yield ? scheduler.yield() : new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Decompresses `input` on the main thread in time slices, yielding between them so the UI stays
 * responsive, and stops once `maxOutputBytes` have been produced. Invalid data is a `failed` outcome.
 */
export async function decompress(
  input: Uint8Array,
  codec: CompressionCodec,
  options: { maxOutputBytes: number; signal?: AbortSignal },
): Promise<DecompressOutcome> {
  const decode = await decoderLoaders[codec]()
  const out = new ByteWriter(options.maxOutputBytes)
  let sliceStart = performance.now()
  try {
    const steps = decode(input, out)
    while (!steps.next().done) {
      if (performance.now() - sliceStart < TIME_SLICE_MS) continue
      await yieldToMain()
      if (options.signal?.aborted) return { kind: "cancelled" }
      sliceStart = performance.now()
    }
  } catch (err) {
    if (err instanceof DecodeError) {
      return { kind: "failed", error: `Not valid ${COMPRESSION_CODEC_LABELS[codec]} data: ${err.message}.` }
    }
    throw err
  }
  if (options.signal?.aborted) return { kind: "cancelled" }
  return {
    kind: "decoded",
    output: out.bytes(),
    truncated: out.truncated,
    ...(out.declaredSize !== undefined ? { declaredSize: out.declaredSize } : {}),
  }
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

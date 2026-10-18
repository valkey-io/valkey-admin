import { GLIDE_HEADER_SIZE, GLIDE_SUPPORTED_VERSION, parseGlideHeader } from "@common/src/compression"
import { type Decoder, DecodeError } from "./byte-writer"
import { decodeGlideLz4Payload } from "./lz4"

/**
 * Wraps a payload decoder with checks of GLIDE's 5-byte compression header. Only format version 0
 * is known; GLIDE marks automatic compression as experimental, so other versions are refused, not guessed.
 */
function glideDecoder(backend: "zstd" | "lz4", decodePayload: Decoder): Decoder {
  return function* (input, out) {
    const header = parseGlideHeader(input)
    if (!header) throw new DecodeError("missing the GLIDE compression header")
    if (header.version !== GLIDE_SUPPORTED_VERSION) {
      throw new DecodeError(`unsupported GLIDE compression format version ${header.version}`)
    }
    if (header.backend !== backend) throw new DecodeError(`the GLIDE header says this value uses ${header.backend}`)
    yield* decodePayload(input, out)
  }
}

export const decodeGlideLz4 = glideDecoder("lz4", (input, out) => decodeGlideLz4Payload(input, GLIDE_HEADER_SIZE, out))

/** The zstd decoder is passed in so it stays in its own lazily loaded chunk. */
export const createGlideZstdDecoder = (decodeZstd: Decoder) =>
  glideDecoder("zstd", (input, out) => decodeZstd(input.subarray(GLIDE_HEADER_SIZE), out))

import { Decompress } from "fzstd"
import { pump } from "./stream-pump"
import type { ByteWriter } from "./byte-writer"

/** One or more zstd frames. */
export function decodeZstd(input: Uint8Array, out: ByteWriter) {
  return pump((ondata) => new Decompress(ondata), input, out, 16 * 1024)
}

import { Gunzip, Unzlib } from "fflate"
import { pump } from "./stream-pump"
import type { ByteWriter } from "./byte-writer"

/** gzip, including multi-member files. fflate doesn't verify the CRC-32 trailer. */
export function decodeGzip(input: Uint8Array, out: ByteWriter) {
  return pump((ondata) => new Gunzip(ondata), input, out, 1024)
}

/** zlib (RFC 1950). fflate doesn't verify the Adler-32 trailer. */
export function decodeZlib(input: Uint8Array, out: ByteWriter) {
  return pump((ondata) => new Unzlib(ondata), input, out, 1024)
}

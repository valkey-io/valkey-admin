import { type ByteWriter, DecodeError } from "./byte-writer"

export type StreamHandler = (data: Uint8Array, final?: boolean) => unknown
export type Stream = { push(chunk: Uint8Array, final?: boolean): unknown }

/** Thrown from a stream's data handler to abort the push in progress once the output limit is reached. */
class OutputLimitReached extends Error {}

/**
 * Feeds `input` to a streaming decompressor in chunks, yielding between them. Deflate inflates a whole
 * pushed chunk at once (up to ~1000x its size), so its chunks stay small; zstd emits one block (at most
 * 128 KiB) per callback, so throwing from the callback stops it within a block of the limit.
 */
export function* pump(createStream: (ondata: StreamHandler) => Stream, input: Uint8Array, out: ByteWriter, chunkSize: number) {
  if (input.length === 0) throw new DecodeError("input is empty")
  let ended = false
  const stream = createStream((data, final) => {
    if (!out.write(data)) throw new OutputLimitReached()
    if (final) ended = true
  })
  try {
    for (let pos = 0; pos < input.length; pos += chunkSize) {
      stream.push(input.subarray(pos, pos + chunkSize), pos + chunkSize >= input.length)
      yield
    }
  } catch (err) {
    if (err instanceof OutputLimitReached) return
    throw new DecodeError(err instanceof Error ? err.message : String(err))
  }
  if (!ended) throw new DecodeError("data ends before the end of the stream")
}


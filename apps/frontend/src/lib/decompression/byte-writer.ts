/**
 * Thrown by decoders when the input doesn't match the format; the message says where and why.
 */
export class DecodeError extends Error {}

/**
 * A step-wise decoder. It writes into `out` and yields between chunks so the caller can let the UI
 * repaint and check for cancellation. It returns early once `out` is truncated.
 */
export type Decoder = (input: Uint8Array, out: ByteWriter) => Generator<void, void>

const INITIAL_CAPACITY = 64 * 1024

/**
 * Growable output buffer with a hard limit. Writes past the limit keep what fits and mark the
 * output truncated, so a decoder never allocates more than `limit` bytes however large its input claims to be.
 */
export class ByteWriter {
  length = 0
  truncated = false
  /** Uncompressed size declared by the format's header, when it has one. */
  declaredSize?: number
  readonly limit: number
  private buffer: Uint8Array

  constructor(limit: number) {
    this.limit = limit
    this.buffer = new Uint8Array(Math.min(limit, INITIAL_CAPACITY))
  }

  /** Pre-sizes the buffer for a declared output size, never beyond the limit. */
  reserve(size: number): void {
    this.ensureCapacity(Math.min(this.limit, this.length + size))
  }

  /** Appends `src[start, end)`; returns false when the limit cut the write short. */
  write(src: Uint8Array, start = 0, end = src.length): boolean {
    const count = this.fit(end - start)
    this.buffer.set(src.subarray(start, start + count), this.length)
    this.length += count
    return !this.truncated
  }

  /**
   * Appends `length` bytes copied from `offset` bytes back. The source may overlap the bytes being
   * written (offset < length), which repeats the last `offset` bytes. Callers validate `offset`.
   */
  copyMatch(offset: number, length: number): boolean {
    let remaining = this.fit(length)
    // Any multiple of `offset` back holds the same repeating pattern, so the copy window doubles each step.
    let distance = offset
    while (remaining > 0) {
      const step = Math.min(distance, remaining)
      this.buffer.copyWithin(this.length, this.length - distance, this.length - distance + step)
      this.length += step
      remaining -= step
      if (distance * 2 <= this.length) distance *= 2
    }
    return !this.truncated
  }

  bytes(): Uint8Array {
    return this.buffer.subarray(0, this.length)
  }

  /** Grows the buffer for `count` more bytes and returns how many fit under the limit. */
  private fit(count: number): number {
    const fitting = Math.min(count, this.limit - this.length)
    if (fitting < count) this.truncated = true
    this.ensureCapacity(this.length + fitting)
    return fitting
  }

  private ensureCapacity(capacity: number): void {
    if (capacity <= this.buffer.length) return
    const next = new Uint8Array(Math.min(this.limit, Math.max(capacity, this.buffer.length * 2)))
    next.set(this.buffer.subarray(0, this.length))
    this.buffer = next
  }
}

export function readUint32LE(input: Uint8Array, pos: number): number {
  return (input[pos] | (input[pos + 1] << 8) | (input[pos + 2] << 16) | (input[pos + 3] << 24)) >>> 0
}

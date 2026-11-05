import { type ByteWriter, DecodeError, readUint32LE } from "./byte-writer"

// Formats: https://github.com/lz4/lz4/blob/dev/doc/lz4_Block_format.md and lz4_Frame_format.md
const FRAME_MAGIC = 0x184d2204
const SKIPPABLE_FRAME_MAGIC = 0x184d2a50 // the low 4 bits are user-defined
const MIN_MATCH = 4
const SEQUENCES_PER_YIELD = 4096
const BLOCK_MAX_SIZES: Record<number, number> = { 4: 64 * 1024, 5: 256 * 1024, 6: 1024 * 1024, 7: 4 * 1024 * 1024 }

/** Reads the 255-continued length extension that follows a nibble of 15. */
function readLengthExtension(input: Uint8Array, pos: number, end: number, base: number): [number, number] {
  let length = base
  let byte
  do {
    if (pos >= end) throw new DecodeError(`block ends inside a length at byte ${pos}`)
    byte = input[pos++]
    length += byte
  } while (byte === 255)
  return [length, pos]
}

/**
 * Decodes one LZ4 block from `input[start, end)`. `windowStart` is the earliest output position a match
 * may reference: the block's own start for independent blocks, 0 when blocks are linked.
 */
export function* decodeLz4Block(
  input: Uint8Array, start: number, end: number, out: ByteWriter, windowStart: number,
): Generator<void, void> {
  let pos = start
  let sequences = 0
  while (pos < end) {
    const token = input[pos++]
    let literalLength = token >>> 4
    if (literalLength === 15) [literalLength, pos] = readLengthExtension(input, pos, end, literalLength)
    if (literalLength > end - pos) {
      throw new DecodeError(`literal run of ${literalLength} bytes at byte ${pos} runs past the end of the block`)
    }
    if (!out.write(input, pos, pos + literalLength)) return
    pos += literalLength
    // The last sequence carries literals only.
    if (pos === end) return

    if (end - pos < 2) throw new DecodeError(`block ends inside a match offset at byte ${pos}`)
    const offset = input[pos] | (input[pos + 1] << 8)
    if (offset === 0 || offset > out.length - windowStart) {
      throw new DecodeError(`match at byte ${pos} references data before the start of the output (offset ${offset})`)
    }
    pos += 2
    let matchLength = token & 15
    if (matchLength === 15) [matchLength, pos] = readLengthExtension(input, pos, end, matchLength)
    if (!out.copyMatch(offset, matchLength + MIN_MATCH)) return

    if (++sequences % SEQUENCES_PER_YIELD === 0) yield
  }
}

/** A raw LZ4 block with no framing; its size is unknown, so it decodes until the input ends. */
export function* decodeLz4RawBlock(input: Uint8Array, out: ByteWriter): Generator<void, void> {
  if (input.length === 0) throw new DecodeError("input is empty")
  yield* decodeLz4Block(input, 0, input.length, out, 0)
}

function* decodeFrame(input: Uint8Array, start: number, out: ByteWriter): Generator<void, number> {
  let pos = start
  if (input.length - pos < 3) throw new DecodeError("frame header is truncated")
  const flags = input[pos]
  const blockDescriptor = input[pos + 1]
  if (flags >>> 6 !== 1) throw new DecodeError(`unsupported frame version ${flags >>> 6}`)
  if ((flags & 0x02) !== 0 || (blockDescriptor & 0x8f) !== 0) throw new DecodeError("frame header has reserved bits set")
  const independentBlocks = (flags & 0x20) !== 0
  const hasBlockChecksums = (flags & 0x10) !== 0
  const hasContentSize = (flags & 0x08) !== 0
  const hasContentChecksum = (flags & 0x04) !== 0
  if ((flags & 0x01) !== 0) throw new DecodeError("frames that need a dictionary aren't supported")
  const blockMaxSize = BLOCK_MAX_SIZES[(blockDescriptor >>> 4) & 0x07]
  if (blockMaxSize === undefined) throw new DecodeError("frame header has an invalid block size")

  // FLG, BD, optional 8-byte content size, then the header checksum byte (not verified).
  const headerLength = 2 + (hasContentSize ? 8 : 0) + 1
  if (input.length - pos < headerLength) throw new DecodeError("frame header is truncated")
  if (hasContentSize) {
    const contentSize = readUint32LE(input, pos + 2) + readUint32LE(input, pos + 6) * 2 ** 32
    out.declaredSize = (out.declaredSize ?? 0) + contentSize
    out.reserve(contentSize)
  }
  pos += headerLength
  // Linked blocks may reference earlier blocks of the same frame, never a previous frame.
  const frameStart = out.length

  for (;;) {
    if (input.length - pos < 4) throw new DecodeError("frame ends without an end mark")
    const blockHeader = readUint32LE(input, pos)
    pos += 4
    if (blockHeader === 0) break

    const isUncompressed = blockHeader >>> 31 === 1
    const blockSize = blockHeader & 0x7fffffff
    if (blockSize > blockMaxSize) {
      throw new DecodeError(`block of ${blockSize} bytes exceeds the frame's ${blockMaxSize}-byte block size`)
    }
    if (blockSize > input.length - pos) throw new DecodeError(`block at byte ${pos - 4} runs past the end of the input`)

    if (isUncompressed) {
      out.write(input, pos, pos + blockSize)
    } else {
      yield* decodeLz4Block(input, pos, pos + blockSize, out, independentBlocks ? out.length : frameStart)
    }
    if (out.truncated) return pos

    pos += blockSize + (hasBlockChecksums ? 4 : 0)
    if (pos > input.length) throw new DecodeError("block checksum is truncated")
    yield
  }

  if (hasContentChecksum) {
    pos += 4
    if (pos > input.length) throw new DecodeError("content checksum is truncated")
  }
  return pos
}

/**
 * Decodes one or more concatenated LZ4 frames, skipping skippable frames. Header, block and content
 * checksums (xxHash32) are not verified.
 */
export function* decodeLz4Frames(input: Uint8Array, out: ByteWriter): Generator<void, void> {
  if (input.length === 0) throw new DecodeError("input is empty")
  let pos = 0
  while (pos < input.length) {
    if (input.length - pos < 4) throw new DecodeError(`${input.length - pos} unexpected bytes after the last frame`)
    const magic = readUint32LE(input, pos)
    if ((magic & 0xfffffff0) >>> 0 === SKIPPABLE_FRAME_MAGIC) {
      if (input.length - pos < 8) throw new DecodeError("skippable frame header is truncated")
      const size = readUint32LE(input, pos + 4)
      if (size > input.length - pos - 8) throw new DecodeError("skippable frame runs past the end of the input")
      pos += 8 + size
      continue
    }
    if (magic !== FRAME_MAGIC) {
      throw new DecodeError(pos === 0 ? "missing LZ4 frame magic number" : `unexpected bytes after the frame at byte ${pos}`)
    }
    pos = yield* decodeFrame(input, pos + 4, out)
    if (out.truncated) return
  }
}

/**
 * GLIDE's LZ4 payload (after its 5-byte header): a 4-byte little-endian original size, then one raw block.
 */
export function* decodeGlideLz4Payload(input: Uint8Array, start: number, out: ByteWriter): Generator<void, void> {
  if (input.length - start < 4) throw new DecodeError("missing the original size")
  const originalSize = readUint32LE(input, start)
  out.declaredSize = originalSize
  out.reserve(originalSize)
  yield* decodeLz4Block(input, start + 4, input.length, out, out.length)
  if (!out.truncated && out.length !== originalSize) {
    throw new DecodeError(`decoded ${out.length} bytes but the header declares ${originalSize}`)
  }
}

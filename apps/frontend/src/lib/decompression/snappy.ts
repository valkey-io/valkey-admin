import { type ByteWriter, DecodeError } from "./byte-writer"

// Formats: https://github.com/google/snappy/blob/main/format_description.txt and framing_format.txt
const ELEMENTS_PER_YIELD = 4096
const MAX_VARINT_BYTES = 5
const FRAMED_CHUNK_MAX_UNCOMPRESSED = 65536
const STREAM_IDENTIFIER = [0xff, 0x06, 0x00, 0x00, 0x73, 0x4e, 0x61, 0x50, 0x70, 0x59]

function readVarint(input: Uint8Array, start: number, end: number): [number, number] {
  let value = 0
  for (let i = 0, pos = start; i < MAX_VARINT_BYTES; i++, pos++) {
    if (pos >= end) throw new DecodeError("input ends inside the uncompressed length")
    const byte = input[pos]
    value += (byte & 0x7f) * 2 ** (7 * i)
    if ((byte & 0x80) === 0) {
      if (value > 0xffffffff) throw new DecodeError("uncompressed length is larger than 4 GiB")
      return [value, pos + 1]
    }
  }
  throw new DecodeError("uncompressed length is longer than 5 bytes")
}

/** Reads `count` little-endian bytes, after checking they exist. */
function readLE(input: Uint8Array, pos: number, end: number, count: number): number {
  if (end - pos < count) throw new DecodeError(`input ends inside an element at byte ${pos}`)
  let value = 0
  for (let i = 0; i < count; i++) value += input[pos + i] * 2 ** (8 * i)
  return value
}

/**
 * Decodes raw Snappy from `input[start, end)`: a varint uncompressed length, then literal and copy elements.
 * The declared length is checked before anything is decoded, and only the part under the output limit is allocated.
 */
function* decodeSnappyBlock(
  input: Uint8Array, start: number, end: number, out: ByteWriter, maxLength = Infinity,
): Generator<void, number> {
  const [declaredLength, dataStart] = readVarint(input, start, end)
  if (declaredLength > maxLength) {
    throw new DecodeError(`chunk declares ${declaredLength} bytes, more than the ${maxLength}-byte maximum`)
  }
  out.reserve(declaredLength)
  const blockStart = out.length
  let pos = dataStart
  let elements = 0

  while (pos < end) {
    const tag = input[pos++]
    let length: number
    let offset = 0
    switch (tag & 0x03) {
      case 0: {
        length = tag >>> 2
        if (length >= 60) {
          const extraBytes = length - 59
          length = readLE(input, pos, end, extraBytes)
          pos += extraBytes
        }
        length += 1
        if (length > end - pos) throw new DecodeError(`literal of ${length} bytes at byte ${pos} runs past the end of the input`)
        break
      }
      case 1:
        length = ((tag >>> 2) & 0x07) + 4
        offset = ((tag >>> 5) << 8) | readLE(input, pos, end, 1)
        pos += 1
        break
      case 2:
        length = (tag >>> 2) + 1
        offset = readLE(input, pos, end, 2)
        pos += 2
        break
      default:
        length = (tag >>> 2) + 1
        offset = readLE(input, pos, end, 4)
        pos += 4
    }

    const produced = out.length - blockStart
    if (length > declaredLength - produced) {
      throw new DecodeError(`element at byte ${pos} decodes past the declared length of ${declaredLength} bytes`)
    }
    if (offset === 0) {
      if ((tag & 0x03) !== 0) throw new DecodeError(`copy at byte ${pos} has offset 0`)
      out.write(input, pos, pos + length)
      pos += length
    } else {
      if (offset > produced) {
        throw new DecodeError(`copy at byte ${pos} references data before the start of the output (offset ${offset})`)
      }
      out.copyMatch(offset, length)
    }
    if (out.truncated) return declaredLength

    if (++elements % ELEMENTS_PER_YIELD === 0) yield
  }

  if (out.length - blockStart !== declaredLength) {
    throw new DecodeError(`decoded ${out.length - blockStart} bytes but the header declares ${declaredLength}`)
  }
  return declaredLength
}

export function* decodeSnappyRaw(input: Uint8Array, out: ByteWriter): Generator<void, void> {
  if (input.length === 0) throw new DecodeError("input is empty")
  // Peek at the declared length so a truncated result can report the full size.
  out.declaredSize = readVarint(input, 0, input.length)[0]
  yield* decodeSnappyBlock(input, 0, input.length, out)
}

/**
 * Decodes the Snappy framing format. Chunk checksums (masked CRC-32C) are not verified.
 */
export function* decodeSnappyFramed(input: Uint8Array, out: ByteWriter): Generator<void, void> {
  if (!STREAM_IDENTIFIER.every((byte, i) => input[i] === byte)) throw new DecodeError("missing the Snappy stream identifier")
  let pos = 0
  while (pos < input.length) {
    if (input.length - pos < 4) throw new DecodeError(`chunk header at byte ${pos} is truncated`)
    const type = input[pos]
    const size = input[pos + 1] | (input[pos + 2] << 8) | (input[pos + 3] << 16)
    const dataStart = pos + 4
    if (size > input.length - dataStart) throw new DecodeError(`chunk at byte ${pos} runs past the end of the input`)

    if (type === 0xff) {
      if (size !== 6 || !STREAM_IDENTIFIER.every((byte, i) => input[pos + i] === byte)) {
        throw new DecodeError(`invalid stream identifier at byte ${pos}`)
      }
    } else if (type === 0x00 || type === 0x01) {
      if (size < 4) throw new DecodeError(`chunk at byte ${pos} is too short for its checksum`)
      // Skip the 4-byte checksum.
      const payloadStart = dataStart + 4
      const payloadEnd = dataStart + size
      if (type === 0x00) {
        yield* decodeSnappyBlock(input, payloadStart, payloadEnd, out, FRAMED_CHUNK_MAX_UNCOMPRESSED)
      } else {
        if (payloadEnd - payloadStart > FRAMED_CHUNK_MAX_UNCOMPRESSED) {
          throw new DecodeError(`uncompressed chunk at byte ${pos} is larger than ${FRAMED_CHUNK_MAX_UNCOMPRESSED} bytes`)
        }
        out.write(input, payloadStart, payloadEnd)
      }
      if (out.truncated) return
    } else if (type < 0x80) {
      throw new DecodeError(`reserved chunk type 0x${type.toString(16).padStart(2, "0")} at byte ${pos}`)
    }
    // 0x80-0xfe are skippable (0xfe is padding).

    pos = dataStart + size
    yield
  }
}

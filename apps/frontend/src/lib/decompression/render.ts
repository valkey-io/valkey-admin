export type DecompressedView = "json" | "text" | "hex"

export type DecompressedPreview = {
  view: DecompressedView;
  preview: string;
  // The preview shows `previewBytes` bytes of the output starting at byte `previewStart`.
  previewStart: number;
  previewBytes: number;
  // The preview covers less than the whole output.
  previewTruncated: boolean;
}

const HEX_BYTES_PER_LINE = 16
// A hex dump line holding n bytes is this many characters plus n: offset, padded hex column and ASCII column borders.
const HEX_LINE_OVERHEAD = 8 + 2 + (HEX_BYTES_PER_LINE * 3 - 1) + 2 + 2
// C0 controls other than tab, line feed, form feed and carriage return, plus DEL. NUL bytes are valid UTF-8 but render
// as nothing, so text containing these is shown as hex.
// eslint-disable-next-line no-control-regex
const NON_TEXT_CONTROL = /[\x00-\x08\x0b\x0e-\x1f\x7f]/

/**
 * Readable UTF-8 text, or undefined for invalid UTF-8 or control characters.
 * `allowCutOffEnd` accepts a multi-byte character cut off by truncation.
 */
function decodeText(bytes: Uint8Array, allowCutOffEnd: boolean): string | undefined {
  try {
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes, { stream: allowCutOffEnd })
    return NON_TEXT_CONTROL.test(text) ? undefined : text
  } catch {
    return undefined
  }
}

/**
 * Pretty-printed JSON for a whole object or array, or undefined when it isn't JSON or its UTF-8 size exceeds `maxBytes`.
 */
function prettyJson(output: Uint8Array, maxBytes: number): string | undefined {
  const text = decodeText(output, false)
  const trimmed = text?.trimStart()
  if (text === undefined || (!trimmed!.startsWith("{") && !trimmed!.startsWith("["))) return undefined
  try {
    const pretty = JSON.stringify(JSON.parse(text), null, 2)
    return utf8Length(pretty) <= maxBytes ? pretty : undefined
  } catch {
    return undefined
  }
}

const utf8Length = (text: string) => new TextEncoder().encode(text).length

/** Moves `pos` past UTF-8 continuation bytes (at most 3) so decoding starts on a character boundary. */
function alignToCharStart(bytes: Uint8Array, pos: number): number {
  let aligned = pos
  while (aligned < bytes.length && aligned < pos + 3 && (bytes[aligned] & 0xc0) === 0x80) aligned++
  return aligned
}

/** Hex dump whose offset column counts from `baseOffset`, the position of `bytes` in the whole output. */
function hexDump(bytes: Uint8Array, baseOffset: number): string {
  const lines: string[] = []
  for (let offset = 0; offset < bytes.length; offset += HEX_BYTES_PER_LINE) {
    const line = bytes.subarray(offset, offset + HEX_BYTES_PER_LINE)
    const hex = Array.from(line, (byte) => byte.toString(16).padStart(2, "0")).join(" ")
    const ascii = Array.from(line, (byte) => (byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : ".")).join("")
    lines.push(`${(baseOffset + offset).toString(16).padStart(8, "0")}  ${hex.padEnd(HEX_BYTES_PER_LINE * 3 - 1)}  |${ascii}|`)
  }
  return lines.join("\n")
}

/** How many bytes a hex dump can show within `maxChars` characters, newlines included. */
function hexBytesWithin(maxChars: number): number {
  const fullLineChars = HEX_LINE_OVERHEAD + HEX_BYTES_PER_LINE + 1
  // The last line has no newline.
  const fullLines = Math.floor((maxChars + 1) / fullLineChars)
  const partialLineChars = maxChars - fullLines * fullLineChars + (fullLines === 0 ? 1 : 0)
  return fullLines * HEX_BYTES_PER_LINE + Math.max(0, partialLineChars - HEX_LINE_OVERHEAD)
}

/**
 * Picks how decoded bytes are shown, limited to `previewMaxBytes` of rendered UTF-8 starting at `previewStart`:
 * pretty JSON, UTF-8 text, or a hex dump (also used for control characters). The view is chosen from the shown bytes.
 * JSON is only parsed when the whole output is present and its pretty form fits, since truncated JSON won't parse.
 * Text is cut on UTF-8 character boundaries.
 */
export function renderDecompressed(
  output: Uint8Array,
  { truncated, previewMaxBytes, previewStart = 0 }: { truncated: boolean; previewMaxBytes: number; previewStart?: number },
): DecompressedPreview {
  const start = Math.min(previewStart, output.length)
  const json = start === 0 && !truncated && output.length <= previewMaxBytes ? prettyJson(output, previewMaxBytes) : undefined
  if (json !== undefined) {
    return { view: "json", preview: json, previewStart: 0, previewBytes: output.length, previewTruncated: false }
  }

  const textStart = alignToCharStart(output, start)
  const textEnd = Math.min(output.length, textStart + previewMaxBytes)
  // A character cut by the preview end or by truncation is dropped, not treated as invalid.
  const text = decodeText(output.subarray(textStart, textEnd), truncated || textEnd < output.length)
  if (text !== undefined) {
    const shownBytes = utf8Length(text)
    return {
      view: "text",
      preview: text,
      previewStart: textStart,
      previewBytes: shownBytes,
      previewTruncated: textStart > 0 || textStart + shownBytes < output.length,
    }
  }

  const hexEnd = Math.min(output.length, start + hexBytesWithin(previewMaxBytes))
  return {
    view: "hex",
    preview: hexDump(output.subarray(start, hexEnd), start),
    previewStart: start,
    previewBytes: hexEnd - start,
    previewTruncated: start > 0 || hexEnd < output.length,
  }
}

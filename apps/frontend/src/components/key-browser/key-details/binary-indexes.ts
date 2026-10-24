export interface BinaryStreamPart {
  entry: number;
  field: number;
  part: "field" | "value";
}

/**
 * Looks up whether a stream entry's field name or value at `elements[entry].value[field]` is binary.
 */
export function binaryStreamPartLookup(parts?: BinaryStreamPart[]) {
  const set = new Set((parts ?? []).map(({ entry, field, part }) => `${entry}:${field}:${part}`))
  return {
    has: (entry: number, field: number, part: BinaryStreamPart["part"]) => set.has(`${entry}:${field}:${part}`),
    entryCount: new Set((parts ?? []).map(({ entry }) => entry)).size,
  }
}

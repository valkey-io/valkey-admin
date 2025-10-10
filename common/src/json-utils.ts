import * as R from "ramda"

export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONObject
  | JSONArray

export interface JSONObject {
  [key: string]: JSONValue
}

export type JSONArray = JSONValue[]

export type DiffEntry = {
  keyPath: string[]
  keyPathString: string
  valueA: JSONValue
  valueB: JSONValue
}

// takes an object and converts it into a key path array (without a value), for example,
// { a: { b: { c: 42, d: 24 } } } will turn into [["a", "b", "c"], ["a", "b", "d"]]
// we'll use these paths in getters R.path to compare if a deeply nested value changed between A and B (see below)
export const toKeyPaths = (obj: JSONValue, path: string[] = []): string[][] =>
  R.isNil(obj)
    ? (path.length === 0 ? [] : [path]) // root nil => [], nested nil => [path]
    : typeof obj !== "object"
      ? [path] // primitives are leaves
      : Object.entries(obj as Record<string, JSONValue>)
        .flatMap(([key, val]) => toKeyPaths(val as JSONValue, [...path, key]))

// we have to do this instead of Ramda.map on the tuple to satisfy TS
const mapPaths = (pair: readonly [JSONObject, JSONObject]): string[][][] => [
  toKeyPaths(pair[0]),
  toKeyPaths(pair[1]),
]

// takes two objects and returns a diff of them as DiffEntry[]
export const diff = (a:JSONObject, b:JSONObject): DiffEntry[] =>
  R.pipe(
    mapPaths, // [jsonA, jsonB] -> [[keysInA], [keysInB]]
    R.unnest as (xs: string[][][]) => string[][], // [[keysInA], [keysInB]] => [keysInA, keysInB]
    R.uniqWith<string[]>(R.equals), // [keysInA, keysInB] => [uniq keys from both objects]
    R.reduce<string[], DiffEntry[]>((acc, keyPath) => { // [keys] => [{keyThatChanged, oldValue, newValue}]
      const valueA = R.path(keyPath, a) as JSONValue
      const valueB = R.path(keyPath, b) as JSONValue

      if (valueA !== valueB) {
        acc.push({ keyPath, keyPathString: keyPath.join("."), valueA, valueB }) // it's changed — so store it
      }

      return acc
    }, [])
  )([a, b] as const)

// combining a list of paths back into a json object (which we can then stringify to put into clipboard):
// path[] -> Record<string, JSONValue>[] -> JSONObject
export const toJson = (response) => (diffs: JSONObject[]) =>
  R.pipe(
    R.map(({ keyPath, keyPathString }) => ({ [keyPathString]: R.path(keyPath as string[], response) })),
    R.reduce<JSONObject, JSONObject>(R.mergeLeft, {} as JSONObject),
  )(diffs)

// same as above but for DiffEntry[]
export const diffToJson = (diffs: DiffEntry[]) =>
  R.pipe(
    R.map(({ keyPathString, valueA, valueB }) => ({ [keyPathString]: { valueA, valueB } })),
    R.reduce<JSONObject, JSONObject>(R.mergeLeft, {} as JSONObject),
  )(diffs)

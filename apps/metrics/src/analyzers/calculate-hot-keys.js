import * as R from "ramda"
import { Heap } from "heap-js"
import { Batch } from "@valkey/valkey-glide"
import { VALKEY_CLIENT } from "../../../../common/src/constants.js"
import { getHotSlots } from "./get-hot-slots.js"

const ACCESS_COMMANDS = [
  // READ COMMANDS
  // String commands
  "get", "mget", "getrange", "getex", "substr",

  // Hash commands
  "hget", "hgetall", "hmget", "hkeys", "hvals", "hscan",

  // List commands
  "lrange", "lindex", "llen", "lpos",

  // Set commands
  "smembers", "sismember", "scard", "sscan", "srandmember",

  // ZSet (Sorted Set) commands
  "zrange", "zrangebyscore", "zrevrange", "zcard", "zscore",
  "zscan", "zrank", "zrevrank",

  // Stream commands
  "xrange", "xrevrange", "xread", "xlen",

  // JSON commands
  "json.get", "json.mget",

  // WRITE COMMANDS
  // String commands
  "set", "setex", "psetex", "setnx", "mset",
  "incr", "incrby", "decr", "decrby", "append",

  // Hash commands
  "hset", "hmset", "hdel", "hincrby",

  // List commands
  "lpush", "rpush", "lpop", "rpop", "ltrim", "lset",

  // Set commands
  "sadd", "srem", "spop",

  // ZSet (Sorted Set) commands
  "zadd", "zrem", "zincrby",

  // Stream commands
  "xadd", "xdel", "xtrim", "xack",

  // JSON commands
  "json.set", "json.del", "json.numincrby",
]

const MULTI_KEY_COMMANDS = new Set(["mget", "json.mget"])
const INTERLEAVED_KEY_COMMANDS = new Set(["mset"])

export const calculateHotKeysFromMonitor = ({ limit, cutoff }) => (rows) =>
  R.pipe(
    R.reduce((acc, { command }) => {
      const [cmd, ...args] = command.split(" ").filter(Boolean)
      const normalizedCmd = cmd.trim().toLowerCase()
      if (!ACCESS_COMMANDS.includes(normalizedCmd)) return acc

      if (MULTI_KEY_COMMANDS.has(normalizedCmd)) {
        args.forEach((key) => { acc[key] = (acc[key] ?? 0) + 1 })
      } else if (INTERLEAVED_KEY_COMMANDS.has(normalizedCmd)) {
        R.splitEvery(2, args).forEach(([key]) => { acc[key] = (acc[key] ?? 0) + 1 })
      } else {
        const key = args[0]
        if (key) acc[key] = (acc[key] ?? 0) + 1
      }
      return acc
    }, {}),
    R.toPairs,
    R.sort(R.descend(R.last)),
    R.reject(([, count]) => count <= cutoff),
    R.take(limit),
  )(rows)

// Must have maxmemory-policy set to lfu*
export const calculateHotKeysFromHotSlots = async (client, { count = 50 } = {}) => {
  const hotSlots = await getHotSlots(client)
  const slotPromises = hotSlots.map(async (slot) => {
    const slotId = slot["slotId"]
    const keys = []
    let cursor = slotId
    let cursorToSlot = slotId

    do {
      const [nextCursor, scannedKeys] = await client.customCommand(["SCAN", cursor.toString(), "COUNT", "1"])
      cursor = nextCursor
      keys.push(...scannedKeys)
      cursorToSlot = Number(cursor) & 0x3FFF

    } while (cursorToSlot === slotId && cursor !== 0)
    
    return keys
  })

  const slotKeys = await Promise.all(slotPromises)
  const allKeys = slotKeys.flat()

  // Pipeline OBJECT FREQ in chunks to avoid overwhelming the server
  const { PIPELINE_CHUNK_SIZE } = VALKEY_CLIENT
  const freqResults = []
  for (let i = 0; i < allKeys.length; i += PIPELINE_CHUNK_SIZE) {
    const chunk = allKeys.slice(i, i + PIPELINE_CHUNK_SIZE)
    const batch = new Batch(false)
    for (const key of chunk) {
      batch.customCommand(["OBJECT", "FREQ", key])
    }
    const chunkResults = await client.exec(batch)
    freqResults.push(...chunkResults)
  }

  const heap = new Heap((a, b) => a.freq - b.freq)
  for (let i = 0; i < allKeys.length; i++) {
    const freq = parseInt(freqResults[i])
    if (isNaN(freq) || freq <= 1) continue
    if (heap.size() < count) {
      heap.push({ key: allKeys[i], freq })
    } else if (freq > heap.peek().freq) {
      heap.pop()
      heap.push({ key: allKeys[i], freq })
    }
  }
  return heap.toArray().map(({ key, freq }) => [key, freq])

} 

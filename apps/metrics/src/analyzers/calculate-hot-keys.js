import * as R from "ramda"
import { Heap } from "heap-js"
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

const CUT_OFF_FREQUENCY = 1

export const calculateHotKeysFromMonitor = (rows) =>
  R.pipe(
    R.reduce((acc, { command }) => {
      const [cmd, ...args] = command.split(" ").filter(Boolean)
      if (ACCESS_COMMANDS.includes(cmd.trim().toLowerCase())) {
        args.forEach((key) => {
          acc[key] = acc[key] ? acc[key] + 1 : 1
        })
      }
      return acc
    }, {}),
    R.toPairs,
    R.sort(R.descend(R.last)),
    R.reject(([, count]) => count <= CUT_OFF_FREQUENCY),
  )(rows)

// Must have maxmemory-policy set to lfu*
export const calculateHotKeysFromHotSlots = async (client, count = 50) => {
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
    
    return keys.map( async (key) => {
      // Must have LFU enabled for this to work
      const freq = parseInt(await client.customCommand(["OBJECT", "FREQ", key]))
      return { key, freq }
    })
  })

  const keyFreqNestedPromises = await Promise.all(slotPromises)
  const keyFreqPromises = keyFreqNestedPromises.flat()
  const allKeyFreqs = await Promise.all(keyFreqPromises)

  const heap = new Heap((a, b) => a.freq - b.freq)
  for (const { key, freq } of allKeyFreqs) {
    if (freq <= 1) continue
    if (heap.size() < count){
      heap.push({ key, freq })
    }
    else if ( freq > heap.peek().freq) {
      heap.pop()
      heap.push({ key, freq })
    }
  }
  return heap.toArray().map(({ key, freq }) => [key, freq])

} 

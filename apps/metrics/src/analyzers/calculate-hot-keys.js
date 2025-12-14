import * as R from "ramda"
import { Heap } from "heap-js"
import { getHotSlots } from "./get-hot-slots.js"

export const calculateHotKeysFromMonitor = (rows) => {
  const ACCESS_COMMANDS = ["get", "set", "mget", "hget", "hgetall", "hmget", "json.get", "json.mget"]
  const CUT_OFF_FREQUENCY = 1

  return R.pipe(
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
}

export const calculateHotKeysFromHotSlots = async (client, count = 50) => {
  const hotSlots = await getHotSlots(client)

  const slotPromises = hotSlots.map(async (slot) => {
    //console.log("Slot is: ", slot)
    const slotId = slot["slotId"]
    const keys = []
    let cursor = slotId
    let cursorToSlot = slotId

    do {
      //console.log("Cursor is: ", cursor)
      const [nextCursor, scannedKeys] = await client.sendCommand(["SCAN", cursor.toString(), "COUNT", "1"])
      cursor = nextCursor
      keys.push(...scannedKeys)
      cursorToSlot = Number(cursor) & 0x3FFF

    } while (cursorToSlot === slotId && cursor !== 0)
    
    return keys.map( async (key) => {
      const freq = parseInt(await client.sendCommand(["OBJECT", "FREQ", key]))
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

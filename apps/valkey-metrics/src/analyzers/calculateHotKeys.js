import * as R from 'ramda'
import * as Streamer from '../effects/ndjson-streamer.js'

export const calculateHotKeys = async () => {
  const rows = await Streamer.monitor()
  const ACCESS_COMMANDS = ["get", "set", "mget", "hget", "hgetall", "hmget", "json.get", "json.mget"]
  const CUT_OFF_FREQUENCY = 1

  return R.pipe(
    R.reduce((acc, { ts, command }) => {
      const [cmd, ...args] = command.split(' ').filter(Boolean)
      if (ACCESS_COMMANDS.includes(cmd.trim().toLowerCase())) {
        args.forEach(key => {
          acc[key] = acc[key] ? acc[key] + 1 : 1
        })
      }
      return acc
    }, {}),
    R.toPairs,
    R.sort(R.descend(R.last)),
    R.reject(([key, count]) => count <= CUT_OFF_FREQUENCY)
  )(rows)
}


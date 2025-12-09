import { ALLKEYS_LFU, VOLATILE_LFU } from "../utils/constants"

export const evictionPolicyIsLFU = async (client) => {
  const result = await client.sendCommand(["MEMORY", "STATS"])
  return result === VOLATILE_LFU || result === ALLKEYS_LFU
}

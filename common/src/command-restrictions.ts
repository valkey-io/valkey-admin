export type CommandRestriction = {
  pattern: string[]
  reason: string
}

/**
 * Parses a command string into arguments, respecting quoted strings and escaped quotes.
 * Matches valkey-cli behavior: 'GET "my key"' → ['GET', 'my key']
 */
export const parseCommandArgs = (command: string): string[] => {
  const args: string[] = []
  const input = command.trim()
  let i = 0

  while (i < input.length) {
    // Skip whitespace
    while (i < input.length && /\s/.test(input[i])) i++
    if (i >= input.length) break

    let arg = ""
    if (input[i] === "\"") {
      // Double-quoted string
      i++ // skip opening quote
      while (i < input.length && input[i] !== "\"") {
        if (input[i] === "\\" && i + 1 < input.length) {
          i++ // skip backslash
        }
        arg += input[i]
        i++
      }
      i++ // skip closing quote
    } else if (input[i] === "'") {
      // Single-quoted string
      i++ // skip opening quote
      while (i < input.length && input[i] !== "'") {
        if (input[i] === "\\" && i + 1 < input.length) {
          i++ // skip backslash
        }
        arg += input[i]
        i++
      }
      i++ // skip closing quote
    } else {
      // Unquoted token
      while (i < input.length && !/[\s"']/.test(input[i])) {
        arg += input[i]
        i++
      }
    }

    args.push(arg)
  }

  return args
}

// Block server-destructive commands and changes to the shared connection's state.
export const BLOCKED_COMMANDS: CommandRestriction[] = [
  { pattern: ["SELECT"], reason: "SELECT changes the selected database on the shared connection." },
  { pattern: ["AUTH"], reason: "AUTH changes authentication on the shared connection." },
  { pattern: ["HELLO"], reason: "HELLO can change the protocol, authentication, and name of the shared connection." },
  { pattern: ["RESET"], reason: "RESET resets the shared connection's state." },
  { pattern: ["QUIT"], reason: "QUIT closes the shared connection." },
  { pattern: ["SHUTDOWN"], reason: "SHUTDOWN stops the server and cannot be undone remotely." },
  { pattern: ["DEBUG"], reason: "DEBUG can cause crashes or data corruption." },
  { pattern: ["FLUSHALL"], reason: "FLUSHALL deletes all keys in all databases. This cannot be undone." },
  { pattern: ["FLUSHDB"], reason: "FLUSHDB deletes all keys in the current database. This cannot be undone." },
]

// these commands require confirmation before execution because they can cause severe problems or data loss
export const CONFIRM_COMMANDS: CommandRestriction[] = [
  { pattern: ["KEYS"], reason: "KEYS can block the server for a long time when many keys exist. Consider using SCAN instead." },
  { pattern: ["CONFIG", "RESETSTAT"], reason: "CONFIG RESETSTAT resets all server statistics." },
  { pattern: ["CONFIG", "REWRITE"], reason: "CONFIG REWRITE overwrites the server configuration file." },
  { pattern: ["SLAVEOF"], reason: "SLAVEOF changes replication topology." },
  { pattern: ["REPLICAOF"], reason: "REPLICAOF changes replication topology." },
  { pattern: ["CLUSTER", "RESET"], reason: "CLUSTER RESET resets the cluster state and may cause data loss." },
]

/**
 * Matches the leading command/subcommand tokens against an uppercase restriction
 * pattern, ignoring input case and allowing trailing command arguments.
 */
export function matchesRestriction(parsedArgs: string[], restriction: CommandRestriction): boolean {
  const parts = parsedArgs.map((p) => p.toUpperCase())
  return (
    restriction.pattern.length <= parts.length &&
    restriction.pattern.every((token, i) => parts[i] === token)
  )
}

/**
 * Returns the first blocking rule for a parsed command on any connection type,
 * or undefined when no block applies. Shared by the UI and backend enforcement.
 */
export function findBlockedCommand(parsedArgs: string[]): CommandRestriction | undefined {
  return BLOCKED_COMMANDS.find((r) => matchesRestriction(parsedArgs, r))
}

/**
 * Returns the first matching confirmation rule, or undefined if none applies.
 */
export function findConfirmCommand(parsedArgs: string[]): CommandRestriction | undefined {
  return CONFIRM_COMMANDS.find((r) => matchesRestriction(parsedArgs, r))
}

/**
 * Standard Valkey/Redis write commands that mutate data, configuration, or server state.
 * Subcommands are represented as "COMMAND SUBCOMMAND".
 */
export const WRITE_COMMANDS: ReadonlySet<string> = new Set([
  // String writes
  "SET", "SETNX", "SETEX", "PSETEX", "MSET", "MSETNX", "GETSET", "GETDEL", "GETEX",
  "INCR", "INCRBY", "INCRBYFLOAT", "DECR", "DECRBY", "APPEND", "SETRANGE",

  // Hash writes
  "HSET", "HSETNX", "HMSET", "HDEL", "HINCRBY", "HINCRBYFLOAT",

  // List writes
  "LPUSH", "LPUSHX", "RPUSH", "RPUSHX", "LPOP", "RPOP", "RPOPLPUSH", "LMOVE",
  "BLMOVE", "BLPOP", "BRPOP", "BRPOPLPUSH", "LREM", "LSET", "LTRIM", "LINSERT",

  // Set writes
  "SADD", "SREM", "SPOP", "SMOVE", "SDIFFSTORE", "SINTERSTORE", "SUNIONSTORE",

  // Sorted Set writes
  "ZADD", "ZREM", "ZREMRANGEBYSCORE", "ZREMRANGEBYRANK", "ZREMRANGEBYLEX",
  "ZINCRBY", "ZPOPMAX", "ZPOPMIN", "BZPOPMAX", "BZPOPMIN", "ZDIFFSTORE", "ZINTERSTORE", "ZUNIONSTORE",

  // Stream writes
  "XADD", "XDEL", "XTRIM", "XACK", "XCLAIM", "XAUTOCLAIM",
  "XGROUP", "XGROUP CREATE", "XGROUP CREATECONSUMER", "XGROUP DESTROY", "XGROUP DELCONSUMER", "XGROUP SETID",

  // Generic / Key lifecycle writes
  "DEL", "UNLINK", "EXPIRE", "EXPIREAT", "PEXPIRE", "PEXPIREAT", "PERSIST",
  "RENAME", "RENAMENX", "MOVE", "RESTORE", "MIGRATE", "COPY",

  // Bitmap writes
  "SETBIT", "BITOP",

  // HyperLogLog writes
  "PFADD", "PFMERGE",

  // Geospatial writes
  "GEOADD", "GEOSEARCHSTORE",

  // Server & Administrative writes
  "FLUSHALL", "FLUSHDB", "SWAPDB", "REWRITEAOF", "BGREWRITEAOF", "BGSAVE", "SAVE",
  "CONFIG SET", "CONFIG REWRITE", "CONFIG RESETSTAT",
  "ACL SETUSER", "ACL DELUSER", "ACL LOAD", "ACL SAVE",

  // PubSub / Cluster writes
  "PUBLISH", "SPUBLISH", "CLUSTER ADDSLOTS", "CLUSTER DELSLOTS", "CLUSTER FAILOVER",
  "CLUSTER FORGET", "CLUSTER MEET", "CLUSTER REPLICATE", "CLUSTER RESET", "CLUSTER SETSLOT",

  // JSON module writes
  "JSON.SET", "JSON.DEL", "JSON.NUMINCRBY", "JSON.NUMMULTBY", "JSON.STRAPPEND",
  "JSON.ARRAPPEND", "JSON.ARRINSERT", "JSON.ARRPOP", "JSON.ARRTRIM", "JSON.CLEAR",
  "JSON.TOGGLE", "JSON.MERGE",
])

/**
 * Checks whether a parsed command represents a write/mutation operation.
 */
export function isWriteCommand(parsedArgs: string[]): boolean {
  if (!parsedArgs || parsedArgs.length === 0) return false
  const parts = parsedArgs.map((p) => p.toUpperCase())
  if (parts.length >= 2) {
    const twoToken = `${parts[0]} ${parts[1]}`
    if (WRITE_COMMANDS.has(twoToken)) return true
  }
  return WRITE_COMMANDS.has(parts[0])
}

/**
 * Returns a restriction rule if the command is blocked by Read-Only mode.
 */
export function findReadOnlyBlockedCommand(parsedArgs: string[]): CommandRestriction | undefined {
  if (isWriteCommand(parsedArgs)) {
    const primary = parsedArgs[0]?.toUpperCase() ?? "Command"
    return {
      pattern: [primary],
      reason: `${primary} is a write operation and cannot be executed while Read-Only mode is enabled.`,
    }
  }
  return undefined
}


export type CommandRestriction = {
  pattern: string[]
  reason: string
}

// these commands are blocked and cannot be executed because they can cause server problems
export const BLOCKED_COMMANDS: CommandRestriction[] = [
  { pattern: ["SHUTDOWN"], reason: "SHUTDOWN stops the server and cannot be undone remotely." },
  { pattern: ["DEBUG"], reason: "DEBUG can cause crashes or data corruption." },
]

// these commands require confirmation before execution because they can cause severe problems or data loss
export const CONFIRM_COMMANDS: CommandRestriction[] = [
  { pattern: ["FLUSHALL"], reason: "FLUSHALL deletes all keys in all databases. This cannot be undone." },
  { pattern: ["FLUSHDB"], reason: "FLUSHDB deletes all keys in the current database. This cannot be undone." },
  { pattern: ["KEYS"], reason: "KEYS can block the server for a long time when many keys exist. Consider using SCAN instead." },
  { pattern: ["CONFIG", "RESETSTAT"], reason: "CONFIG RESETSTAT resets all server statistics." },
  { pattern: ["CONFIG", "REWRITE"], reason: "CONFIG REWRITE overwrites the server configuration file." },
  { pattern: ["SLAVEOF"], reason: "SLAVEOF changes replication topology." },
  { pattern: ["REPLICAOF"], reason: "REPLICAOF changes replication topology." },
  { pattern: ["CLUSTER", "RESET"], reason: "CLUSTER RESET resets the cluster state and may cause data loss." },
]

export function matchesRestriction(command: string, restriction: CommandRestriction): boolean {
  const parts = command.trim().toUpperCase().split(/\s+/)
  return (
    restriction.pattern.length <= parts.length &&
    restriction.pattern.every((token, i) => parts[i] === token)
  )
}

export function findBlockedCommand(command: string): CommandRestriction | undefined {
  return BLOCKED_COMMANDS.find((r) => matchesRestriction(command, r))
}

export function findConfirmCommand(command: string): CommandRestriction | undefined {
  return CONFIRM_COMMANDS.find((r) => matchesRestriction(command, r))
}

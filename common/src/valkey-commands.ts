import data from "./valkey-commands.json"

export type CommandParameterType = "key" | "value" | "number"

export type CommandParameter = {
  name: string
  type: CommandParameterType
  required: boolean
  placeholder: string
}

export type ValkeyCommand = {
  name: string
  syntax: string
  category: string
  description: string
  parameters: CommandParameter[]
}

export const VALKEY_COMMANDS: readonly ValkeyCommand[] = data as ValkeyCommand[]

export function findCommandMatches(input: string, limit = 8): ValkeyCommand[] {
  const typed = input.trimStart().toUpperCase()
  if (typed.length === 0) return []
  return VALKEY_COMMANDS
    .filter((command) => command.name !== typed && command.name.startsWith(typed))
    .slice(0, limit)
}

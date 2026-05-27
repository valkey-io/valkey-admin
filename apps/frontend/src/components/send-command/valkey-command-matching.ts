import { distance as levenshteinDistance } from "fastest-levenshtein"
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

export type MatchType = "prefix" | "contains" | "fuzzy"

export type MatchResult = {
  command: ValkeyCommand
  score: number
  matchType: MatchType
  highlightRanges: Array<[number, number]>
}

function findHighlightRanges(
  text: string,
  query: string,
  matchType: MatchType,
): Array<[number, number]> {
  const upperText = text.toUpperCase()
  const upperQuery = query.toUpperCase()

  if (matchType === "prefix" && upperText.startsWith(upperQuery)) {
    return [[0, query.length]]
  }

  if (matchType === "contains") {
    const index = upperText.indexOf(upperQuery)
    if (index !== -1) {
      return [[index, index + query.length]]
    }
  }

  return []
}

export function matchCommands(query: string, maxResults = 10): MatchResult[] {
  if (!query || query.trim().length === 0) return []

  const trimmedQuery = query.trim()
  const upperQuery = trimmedQuery.toUpperCase()
  const results: MatchResult[] = []

  for (const command of VALKEY_COMMANDS) {
    const commandName = command.name
    let matchType: MatchType
    let score: number

    if (commandName.startsWith(upperQuery)) {
      matchType = "prefix"
      score = upperQuery.length / commandName.length
    } else if (commandName.includes(upperQuery)) {
      matchType = "contains"
      score = 0.5 + (upperQuery.length / commandName.length) * 0.3
    } else if (upperQuery.length >= 3) {
      const maxLen = Math.max(upperQuery.length, commandName.length)
      const lenDiff = Math.abs(upperQuery.length - commandName.length)
      if (lenDiff > 0.4 * maxLen) continue

      const distance = levenshteinDistance(upperQuery, commandName)
      const similarity = 1 - distance / maxLen
      if (similarity < 0.6) continue

      matchType = "fuzzy"
      score = similarity * 0.4
    } else {
      continue
    }

    results.push({
      command,
      score,
      matchType,
      highlightRanges: findHighlightRanges(commandName, trimmedQuery, matchType),
    })
  }

  const typeOrder: Record<MatchType, number> = { prefix: 3, contains: 2, fuzzy: 1 }
  results.sort((a, b) => {
    const typeDiff = typeOrder[b.matchType] - typeOrder[a.matchType]
    if (typeDiff !== 0) return typeDiff
    const scoreDiff = b.score - a.score
    if (scoreDiff !== 0) return scoreDiff
    return a.command.name.localeCompare(b.command.name)
  })

  return results.slice(0, maxResults)
}

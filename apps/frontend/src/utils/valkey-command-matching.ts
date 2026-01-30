import { distance as levenshteinDistance } from "fastest-levenshtein"
import type { ValkeyCommand, MatchResult } from "@/types/valkey-commands"
import valkeyCommands from "@/data/valkey-commands.json"

const ALL_COMMANDS = valkeyCommands as ValkeyCommand[]
const NON_ADMIN_COMMANDS = ALL_COMMANDS.filter((cmd) => cmd.tier !== "admin")

/**
 * Find highlight ranges for matched text portions
 */
function findHighlightRanges(text: string, query: string, matchType: "prefix" | "contains" | "fuzzy"): Array<[number, number]> {
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

/**
 * Match commands against a query string using fuzzy matching
 * @param query - The search query
 * @param maxResults - Maximum number of results to return
 * @param adminMode - Whether to include admin-tier commands
 */
export function matchCommands(query: string, maxResults: number = 10, adminMode: boolean = false): MatchResult[] {
  if (!query || query.trim().length === 0) {
    return []
  }

  const trimmedQuery = query.trim()
  const upperQuery = trimmedQuery.toUpperCase()
  const results: MatchResult[] = []

  const commands = adminMode ? ALL_COMMANDS : NON_ADMIN_COMMANDS

  for (const command of commands) {
    const commandName = command.name
    let matchType: "prefix" | "contains" | "fuzzy"
    let score: number

    // Exact prefix match (highest priority)
    if (commandName.startsWith(upperQuery)) {
      matchType = "prefix"
      score = upperQuery.length / commandName.length // Higher score for longer matches
    }
    // Contains match
    else if (commandName.includes(upperQuery)) {
      matchType = "contains"
      score = 0.5 + (upperQuery.length / commandName.length) * 0.3
    }
    // Fuzzy match using Levenshtein distance (only for queries >= 3 chars)
    else if (upperQuery.length >= 3) {
      const maxLen = Math.max(upperQuery.length, commandName.length)
      const lenDiff = Math.abs(upperQuery.length - commandName.length)

      // Skip if length difference alone makes similarity threshold impossible
      if (lenDiff > 0.4 * maxLen) continue

      const distance = levenshteinDistance(upperQuery, commandName)
      const similarity = 1 - (distance / maxLen)

      // Only include if similarity is above threshold (60%)
      if (similarity >= 0.6) {
        matchType = "fuzzy"
        score = similarity * 0.4 // Lower base score for fuzzy matches
      } else {
        continue // Skip this command
      }
    } else {
      continue // Skip if query too short for fuzzy matching
    }

    const highlightRanges = findHighlightRanges(command.name, trimmedQuery, matchType)

    results.push({
      command,
      score,
      matchType,
      highlightRanges,
    })
  }

  // Sort by score (descending) and then by match type priority
  results.sort((a, b) => {
    // First sort by match type priority
    const typeOrder = { prefix: 3, contains: 2, fuzzy: 1 }
    const typeDiff = typeOrder[b.matchType] - typeOrder[a.matchType]
    if (typeDiff !== 0) return typeDiff

    // Then by score
    const scoreDiff = b.score - a.score
    if (scoreDiff !== 0) return scoreDiff

    // Finally by command name alphabetically
    return a.command.name.localeCompare(b.command.name)
  })

  return results.slice(0, maxResults)
}

/**
 * Get commands filtered by admin mode
 * @param options - Filter options
 * @param options.adminMode - Whether to include admin-tier commands (default: false)
 * @returns Filtered list of commands
 */
export function getCommands(options: { adminMode?: boolean } = {}): ValkeyCommand[] {
  const { adminMode = false } = options
  return adminMode ? ALL_COMMANDS : NON_ADMIN_COMMANDS
}

/**
 * Search commands with fuzzy matching
 * @param query - Search query
 * @param options - Search options
 * @param options.adminMode - Whether to include admin-tier commands
 * @param options.maxResults - Maximum number of results
 * @returns Array of match results
 */
export function searchCommands(
  query: string,
  options: { adminMode?: boolean; maxResults?: number } = {},
): MatchResult[] {
  const { adminMode = false, maxResults = 10 } = options
  return matchCommands(query, maxResults, adminMode)
}

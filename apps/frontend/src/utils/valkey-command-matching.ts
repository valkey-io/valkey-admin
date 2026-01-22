import type { ValkeyCommand, MatchResult } from "@/types/valkey-commands"
import valkeyCommands from "@/data/valkey-commands.json"

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null))

  for (let i = 0; i <= str1.length; i++) {
    matrix[0][i] = i
  }

  for (let j = 0; j <= str2.length; j++) {
    matrix[j][0] = j
  }

  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // deletion
        matrix[j - 1][i] + 1, // insertion
        matrix[j - 1][i - 1] + indicator, // substitution
      )
    }
  }

  return matrix[str2.length][str1.length]
}

/**
 * Find highlight ranges for matched text portions
 */
function findHighlightRanges(text: string, query: string, matchType: "prefix" | "contains" | "fuzzy"): Array<[number, number]> {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()

  if (matchType === "prefix" && lowerText.startsWith(lowerQuery)) {
    return [[0, query.length]]
  }

  if (matchType === "contains") {
    const index = lowerText.indexOf(lowerQuery)
    if (index !== -1) {
      return [[index, index + query.length]]
    }
  }

  // For fuzzy matches, we'll highlight the entire command name for simplicity
  if (matchType === "fuzzy") {
    return [[0, text.length]]
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
  const lowerQuery = trimmedQuery.toLowerCase()
  const results: MatchResult[] = []

  // Cast the imported JSON to the correct type
  const commands = getCommands({ adminMode })

  for (const command of commands) {
    const lowerCommandName = command.name.toLowerCase()
    let matchType: "prefix" | "contains" | "fuzzy"
    let score: number

    // Exact prefix match (highest priority)
    if (lowerCommandName.startsWith(lowerQuery)) {
      matchType = "prefix"
      score = lowerQuery.length / lowerCommandName.length // Higher score for longer matches
    }
    // Contains match
    else if (lowerCommandName.includes(lowerQuery)) {
      matchType = "contains"
      score = 0.5 + (lowerQuery.length / lowerCommandName.length) * 0.3
    }
    // Fuzzy match using Levenshtein distance
    else {
      const distance = levenshteinDistance(lowerQuery, lowerCommandName)
      const maxLength = Math.max(lowerQuery.length, lowerCommandName.length)
      const similarity = 1 - (distance / maxLength)

      // Only include if similarity is above threshold (60%)
      if (similarity >= 0.6) {
        matchType = "fuzzy"
        score = similarity * 0.4 // Lower base score for fuzzy matches
      } else {
        continue // Skip this command
      }
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
 * Get all available commands (for reference)
 */
export function getAllCommands(): ValkeyCommand[] {
  return valkeyCommands as ValkeyCommand[]
}

/**
 * Get commands filtered by admin mode
 * @param options - Filter options
 * @param options.adminMode - Whether to include admin-tier commands (default: false)
 * @returns Filtered list of commands
 */
export function getCommands(options: { adminMode?: boolean } = {}): ValkeyCommand[] {
  const { adminMode = false } = options
  const commands = valkeyCommands as ValkeyCommand[]

  if (adminMode) {
    return commands // Return all commands including admin tier
  }

  // Return only default and remediation tier commands
  return commands.filter((cmd) => cmd.tier === "default" || cmd.tier === "remediation")
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

/**
 * Get commands by category
 */
export function getCommandsByCategory(category: string): ValkeyCommand[] {
  const commands = valkeyCommands as ValkeyCommand[]
  return commands.filter((cmd) => cmd.category === category)
}

/**
 * Get commands by tier
 * @param tier - The tier to filter by
 * @returns Commands in the specified tier
 */
export function getCommandsByTier(tier: "default" | "remediation" | "admin"): ValkeyCommand[] {
  const commands = valkeyCommands as ValkeyCommand[]
  return commands.filter((cmd) => cmd.tier === tier)
}

/**
 * Get available categories
 */
export function getCategories(): string[] {
  const commands = valkeyCommands as ValkeyCommand[]
  const categories = new Set(commands.map((cmd) => cmd.category))
  return Array.from(categories).sort()
}

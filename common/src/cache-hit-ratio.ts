export const calculateHitRatio = (hits: number, misses: number): string => {
  const totalRequests = hits + misses
  if (totalRequests === 0) {
    return "-"
  }
  const hitRatio = (hits / totalRequests) * 100
  return `${hitRatio.toFixed(2)}%`
}

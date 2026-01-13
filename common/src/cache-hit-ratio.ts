export const calculateHitRatio = (hits: number, misses: number): string => {
  const totalRequests = hits + misses
  if (totalRequests === 0) {
    return "0.00%"
  }
  const hitRatio = (hits / totalRequests) * 100
  return `${hitRatio.toFixed(2)}%`
}

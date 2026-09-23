export function convertTTL(ttl: number) {
  if (ttl === -1) return "Infinity" 
  if (ttl === -2) return "None" 
  if (ttl <= 0) return "None" 
  
  const secondsInDay = 86400
  const secondsInMonth = 2592000 // 30 days
  
  if (ttl >= secondsInMonth) {
    const months = Math.floor(ttl / secondsInMonth)
    return `${months} month${months > 1 ? "s" : ""}`
  } else if (ttl >= secondsInDay) {
    const days = Math.floor(ttl / secondsInDay)
    return `${days} day${days > 1 ? "s" : ""}`
  } else {
    return `${ttl} second${ttl > 1 ? "s" : ""}`
  }
}

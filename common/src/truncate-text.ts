export const truncateText = (text: string, maxLength = 30) => {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + "..."
}
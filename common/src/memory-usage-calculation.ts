interface KeyInfo {
  name: string;
  type: string;
  ttl: number;
  size: number;
  collectionSize?: number;
}

export function calculateTotalMemoryUsage (keys: KeyInfo[]) {
  const validKeys = keys.filter((key) => key.size > 0)
  if (validKeys.length === 0) return -1
  return validKeys.reduce((total, key) => total + key.size, 0)
};

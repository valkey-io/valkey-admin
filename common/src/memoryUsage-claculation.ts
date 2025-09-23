interface KeyInfo {
    name: string;
    type: string;
    ttl: number;
    size: number;
    collectionSize?: number;
  }

export function calculateTotalMemoryUsage (keys: KeyInfo[]) {
    return keys.reduce((total, key) => total + (key.size || 0), 0);
  };
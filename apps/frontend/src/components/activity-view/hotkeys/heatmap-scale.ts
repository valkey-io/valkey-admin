// for heatmap legend and color scale
export const LEGEND_STEPS = [0, 0.25, 0.5, 0.75, 1]

// Returns the color for a given ratio
export function getColor(ratio: number): string {
  const lightness = Math.round(90 - ratio * 62)
  const saturation = Math.round(70 + ratio * 15)
  return `hsl(0, ${saturation}%, ${lightness}%)`
}

// Snaps a ratio to the nearest bucket (0, 0.25, 0.5, 0.75, 1)
export function snapToBucket(ratio: number): number {
  return Math.round(ratio * 4) / 4
}

// Converts a value to a ratio between 0 and 1 based on the given min and max
export function toRatio(value: number, min: number, max: number): number {
  return max === min ? 0 : (value - min) / (max - min)
}

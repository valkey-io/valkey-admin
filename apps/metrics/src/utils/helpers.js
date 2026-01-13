import * as R from "ramda"

export const ymd = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}${m}${day}` // "20250924"
}

export const parseCommandLogs = (entries, commandLogType) =>
  entries.map(([
    id,
    tsSec,
    metricValue, // duration or size
    argv = [],
    addr = "unknown",
    name = "unknown",
  ] = []) => ({
    id: String(id),
    ts: Number(tsSec) * 1000,
    ...(commandLogType === "slow"
      ? { duration_us: Number(metricValue) }
      : { size: Number(metricValue) }),
    argv: Array.isArray(argv) ? argv.map(String) : [],
    addr: String(addr),
    client: String(name),
  }))

// Min–max downsampling reduces a time series to at most `maxPoints` by splitting the time range into equal buckets
// and keeping only the minimum and maximum value from each bucket to preserve spikes.
export const downsampleMinMaxOrdered = R.curry(({ maxPoints }, series) => {
  if (!series?.length) return []
  if (series.length <= maxPoints) return series // no need to downsample

  const [first, last] = R.juxt([R.head, R.last])(series)

  // Total duration of the time range
  const timespan = last.timestamp - first.timestamp || 1 // so it's not 0 just in case

  // Output size is: 2 + 2 * bucketCount (first + last + min/max per bucket)
  const bucketCount = Math.max(1, Math.floor((maxPoints - 2) / 2))

  // Silly micro-optimization: inverted bucket size to perform "cheaper" multiplication instead of "expensive" division
  const invBucketSize = bucketCount / timespan

  // Pre-allocating buckets
  const buckets = Array.from({ length: bucketCount }, () => ({ min: null, max: null }))

  for (const currentDataPoint of series) {
    // Calculating to which bucketIndex currentDataPoint belongs to
    const bucketIndex = Math.floor((currentDataPoint.timestamp - first.timestamp) * invBucketSize)

    // And we need to make sure that the right-edge timestamp goes into the very last bucket (hence, Math.min)
    const bucket = buckets[Math.min(bucketIndex, bucketCount - 1)]

    // Track the extrema values in this time bucket, i.e. set an extremum from the currentDataPoint if it's
    // an uninitialized bucket or the currentDataPoint's value is more extreme than the one already in the bucket
    if (!bucket.min || currentDataPoint.value < bucket.min.value) bucket.min = currentDataPoint // i.e. downward spikes
    if (!bucket.max || currentDataPoint.value > bucket.max.value) bucket.max = currentDataPoint // i.e. upward spikes
  }

  const out = buckets.reduce((acc, b) => {
    if (!b.min) return acc

    if (b.min === b.max) acc.push(b.min) // just pick any

    // Emit extrema in timestamp order (min/max are value-based, not time-based).
    else if (b.min.timestamp <= b.max.timestamp) acc.push(b.min, b.max)

    else acc.push(b.max, b.min)

    return acc
  }, [first])

  out.push(last)

  return out
})

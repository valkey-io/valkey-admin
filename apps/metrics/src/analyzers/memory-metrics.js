import * as R from "ramda"
import { downsampleMinMaxOrdered } from "../utils/helpers.js"

export const MEMORY_METRICS = {
  // core usage
  total_allocated: {
    key: "allocated_bytes",
    description: "How much memory Valkey is actually using for data and internal structures.",
  },
  allocator_active: {
    key: "active_bytes",
    description: "How much memory the allocator has reserved for Valkey, including unused space.",
  },
  allocator_resident: {
    key: "resident_bytes",
    description: "How much physical memory this process occupies in RAM.",
  },
  peak_allocated: {
    key: "peak_allocated_bytes",
    description: "What was the highest amount of memory Valkey has ever allocated.",
  },

  // dataset vs overhead
  dataset_bytes: {
    key: "dataset_bytes",
    description: "How much memory is used to store actual key and value data.",
  },
  overhead_total: {
    key: "overhead_bytes",
    description: "How much memory is spent on internal bookkeeping instead of user data.",
  },
  dataset_percentage: {
    key: "dataset_percentage",
    description: "What portion of allocated memory is used for actual data rather than overhead.",
  },

  // fragmentation / waste
  "allocator-fragmentation_ratio": {
    key: "fragmentation_ratio",
    description: "Is memory waste growing over time due to fragmentation.",
  },
  fragmentation_bytes: {
    key: "fragmentation_bytes",
    description: "How many bytes are currently wasted because memory is fragmented.",
  },
  "allocator-rss_ratio": {
    key: "allocator_rss_ratio",
    description: "How efficiently allocated memory maps to actual RAM usage.",
  },

  // keyspace
  keys_count: {
    key: "keys_count",
    description: "How many keys are currently stored in Valkey.",
  },
  "keys_bytes-per-key": {
    key: "bytes_per_key",
    description: "On average, how much memory each key consumes.",
  },
}

const allowedRawMetrics = new Set(Object.keys(MEMORY_METRICS))

const seed = () =>
  Object.values(MEMORY_METRICS).reduce((acc, { key, description }) => {
    acc[key] = { description, series: [] }
    return acc
  }, {})

const filterFn =
  ({ since, until } = {}) =>
    ({ metric, ts }) =>
      allowedRawMetrics.has(metric) &&
      (R.isNil(since) || Number(ts) >= Number(since)) &&
      (R.isNil(until) || Number(ts) <= Number(until))

const mapFn = ({ ts, metric, value }) =>
  R.pipe(
    R.prop(metric),
    R.unless(
      R.isNil,
      ({ key }) => ({ key, timestamp: Number(ts), value: Number(value) }), // Ensure numbers
    ),
  )(MEMORY_METRICS)

const reducer = (acc, point) =>
  R.unless(
    R.isNil,
    ({ key, timestamp, value }) => {
      const bucket = acc[key]
      if (!bucket) return acc
      bucket.series.push({ timestamp, value })
      return acc
    },
  )(point) || acc

export const finalizeDownsample = ({ maxPoints = 120 } = {}) => (acc) => {
  for (const key of Object.keys(acc)) {
    acc[key].series = downsampleMinMaxOrdered({ maxPoints }, acc[key].series)
  }
  return acc
}

const memoryFold = ({ maxPoints, since, until } = {}) => ({
  seed: seed(),
  filterFn: filterFn({ since, until }),
  mapFn,
  reducer,
  finalize: R.isNil(maxPoints) ? R.identity : finalizeDownsample({ maxPoints }),
})

export default memoryFold

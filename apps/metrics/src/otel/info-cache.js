/**
 * The last INFO maps the fetchers saw, kept in memory for the OTel export.
 * The export reads this cache at its own interval, so collection and export
 * stay decoupled. Nothing is written to disk.
 */
export const makeInfoCache = () => {
  let memory
  let keyspace
  let cpu

  return {
    setMemory: ({ memory: nextMemory, keyspace: nextKeyspace }) => {
      memory = nextMemory
      keyspace = nextKeyspace
    },
    setCpu: (nextCpu) => {
      cpu = nextCpu
    },
    memory: () => memory,
    keyspace: () => keyspace,
    cpu: () => cpu,
  }
}

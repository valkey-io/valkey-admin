import net from "node:net"

/**
 * A fake Valkey cluster node for the integration tests. It speaks enough RESP
 * to pass Valkey Admin's AUTH probe and report a chosen topology:
 *
 * - accepts any `AUTH` and `HELLO`;
 * - answers every `INFO` with `cluster_enabled:1`, `role:master`, a version
 *   and a memory policy;
 * - answers `CLUSTER SLOTS` with the slots given by the caller, so it can
 *   claim another cluster's id and node addresses;
 * - answers `CONFIG GET`, `MODULE LIST`, `CLUSTER SLOT-STATS`, `CLIENT ...`
 *   and `PING` with harmless values.
 *
 * It models an attacker's server: it accepts the credentials the attacker
 * types and lies about which cluster it belongs to.
 */

export type FakeSlotRange = [number, number, ...Array<[string, number, string]>]

const encodeBulk = (s: string) => `$${Buffer.byteLength(s)}\r\n${s}\r\n`
const encodeArray = (items: string[]) => `*${items.length}\r\n${items.join("")}`
const encodeValue = (v: unknown): string => {
  if (typeof v === "number") return `:${v}\r\n`
  if (typeof v === "string") return encodeBulk(v)
  if (Array.isArray(v)) return encodeArray(v.map(encodeValue))
  return "$-1\r\n"
}

const INFO = [
  "# Server", "redis_version:8.0.0", "valkey_version:8.0.0", "server_name:valkey",
  "# Replication", "role:master", "connected_slaves:0",
  "# Cluster", "cluster_enabled:1",
  "# Memory", "maxmemory_policy:noeviction",
  "# Keyspace",
].join("\r\n") + "\r\n"

// Parse one or more RESP arrays of bulk strings from a buffer. Returns the
// commands found and the unread remainder.
const parseCommands = (buf: Buffer): { commands: string[][]; rest: Buffer } => {
  const commands: string[][] = []
  let offset = 0
  while (offset < buf.length) {
    if (buf[offset] !== 0x2a) break // '*'
    const lineEnd = buf.indexOf("\r\n", offset)
    if (lineEnd < 0) break
    const count = Number(buf.subarray(offset + 1, lineEnd).toString())
    let pos = lineEnd + 2
    const args: string[] = []
    let complete = true
    for (let i = 0; i < count; i++) {
      if (buf[pos] !== 0x24) { complete = false; break } // '$'
      const lenEnd = buf.indexOf("\r\n", pos)
      if (lenEnd < 0) { complete = false; break }
      const len = Number(buf.subarray(pos + 1, lenEnd).toString())
      const start = lenEnd + 2
      if (buf.length < start + len + 2) { complete = false; break }
      args.push(buf.subarray(start, start + len).toString())
      pos = start + len + 2
    }
    if (!complete) break
    commands.push(args)
    offset = pos
  }
  return { commands, rest: buf.subarray(offset) }
}

export type FakeClusterNode = { port: number; close: () => Promise<void>; seen: string[][] }

export const startFakeClusterNode = (slots: FakeSlotRange[], port = 0): Promise<FakeClusterNode> =>
  new Promise((resolve, reject) => {
    const seen: string[][] = []
    const sockets = new Set<net.Socket>()
    const server = net.createServer((socket) => {
      sockets.add(socket)
      socket.on("close", () => sockets.delete(socket))
      let pending = Buffer.alloc(0)
      socket.on("data", (chunk) => {
        pending = Buffer.concat([pending, chunk])
        const { commands, rest } = parseCommands(pending)
        pending = Buffer.from(rest)
        for (const args of commands) {
          seen.push(args)
          const [cmd, sub] = [args[0]?.toUpperCase(), args[1]?.toUpperCase()]
          let reply: string
          if (cmd === "HELLO") {
            // RESP2-style map as a flat array; Glide accepts it.
            reply = encodeValue([
              "server", "valkey", "version", "8.0.0", "proto", 3, "id", 1, "mode", "cluster", "role", "master", "modules", [],
            ])
          } else if (cmd === "AUTH" || cmd === "SELECT" || cmd === "CLIENT" || cmd === "READONLY" || cmd === "READWRITE") {
            reply = "+OK\r\n"
          } else if (cmd === "PING") {
            reply = "+PONG\r\n"
          } else if (cmd === "INFO") {
            reply = encodeBulk(INFO)
          } else if (cmd === "CLUSTER" && sub === "SLOTS") {
            reply = encodeValue(slots)
          } else if (cmd === "CLUSTER" && sub === "SLOT-STATS") {
            reply = encodeValue([])
          } else if (cmd === "CONFIG" && sub === "GET") {
            reply = encodeValue([])
          } else if (cmd === "MODULE") {
            reply = encodeValue([])
          } else {
            reply = `-ERR unknown command '${args[0]}'\r\n`
          }
          socket.write(reply)
        }
      })
      socket.on("error", () => undefined)
    })
    server.on("error", reject)
    server.listen(port, "0.0.0.0", () => {
      const address = server.address()
      if (!address || typeof address === "string") return reject(new Error("no address"))
      resolve({
        port: address.port,
        seen,
        close: () => new Promise((r) => {
          for (const socket of sockets) socket.destroy()
          server.close(() => r())
        }),
      })
    })
  })

import tls from "node:tls"
import Valkey from "iovalkey"
import { readCaCertificate, warnIfTlsUnverified } from "./valkey-client"
import type { InfoOptions } from "@valkey/valkey-glide"

/**
 * Short-lived AUTH probe on iovalkey.
 *
 * Every connect and topology discovery first proves the presented credentials
 * on the requested node, and the failed-AUTH limit counts each rejection. The
 * probe used to be a Glide client. When Valkey rejects the credentials, Glide
 * 2.5 and 2.6 reject `createClient` but keep the connection in the native
 * core and retry AUTH with the same credentials about every 3 seconds until
 * the process exits, whenever another Glide client is open in the process (the
 * server always has one). No client object is returned, so the server cannot
 * close it. Each failed connect then leaks a client that sends AUTH forever,
 * which fills Valkey's ACL log and the server's threads and memory. This is
 * valkey-glide issue #3352
 * (https://github.com/valkey-io/valkey-glide/issues/3352).
 * Glide's Static discovery mode does not leak, but it reports WRONGPASS only
 * as a timeout, so the limit could not tell a wrong password from a slow node.
 *
 * So the probe uses iovalkey: one socket, no reconnect, and an explicit AUTH
 * command whose reply decides the result. The socket is always closed, so a
 * rejection leaves nothing behind. Working clients stay on Glide.
 *
 * The probe does TLS in Node, and the working client does TLS in Glide's
 * Rust core. Both verify the certificate and the host name. The probe trusts
 * the same roots as Glide: the operator's CA file when one is set, or else the
 * OS trust store (plus Node's bundled roots). In rare cases the two TLS
 * stacks still disagree, and a connect then fails after the probe passed.
 */

/** Credentials sent in the probe's AUTH command. IAM tokens are already signed or minted. */
export type ProbeCredentials = { username?: string; password: string }

export type AuthProbeOptions = {
  host: string
  port: number
  credentials?: ProbeCredentials
  useTLS: boolean
  verifyTlsCertificate: boolean
  caCertPath?: string
}

/** The commands the server runs on a probe after Valkey accepts the credentials. */
export type AuthProbe = {
  info: (sections: InfoOptions[]) => Promise<string>
  customCommand: (args: string[]) => Promise<unknown>
  close: () => void
}

// Same limits as the Glide clients (`buildSharedOptions` in valkey-client.ts).
const CONNECT_TIMEOUT_MS = 30_000
const COMMAND_TIMEOUT_MS = 5_000

let defaultRoots: string[] | undefined

// Glide verifies against the OS trust store when no CA file is set. Node uses
// only its bundled roots unless it is told otherwise, so add the OS roots.
const osAndBundledRoots = (): string[] | undefined => {
  if (!defaultRoots) {
    try {
      defaultRoots = [...new Set([...tls.getCACertificates("default"), ...tls.getCACertificates("system")])]
    } catch (err) {
      console.warn("Unable to read the OS trust store for the AUTH probe; using Node's bundled roots:", err)
      return undefined
    }
  }
  return defaultRoots
}

const tlsOptions = ({ useTLS, verifyTlsCertificate, caCertPath }: AuthProbeOptions): tls.ConnectionOptions | undefined => {
  if (!useTLS) return undefined
  warnIfTlsUnverified(useTLS, verifyTlsCertificate)
  if (verifyTlsCertificate === false) return { rejectUnauthorized: false }
  if (caCertPath) return { ca: readCaCertificate(caCertPath) }
  const ca = osAndBundledRoots()
  return ca ? { ca } : {}
}

// `normalizeEndpoint` keeps IPv6 brackets; Node's `net` wants the bare address.
const socketHost = (host: string): string => host.replace(/^\[(.*)\]$/, "$1")

/**
 * Open a socket to the node and authenticate. Resolves with a probe that can
 * run commands, or rejects with Valkey's reply (WRONGPASS, NOAUTH) or the
 * socket error. On rejection the socket is already closed.
 *
 * Without credentials the probe sends PING, so a node that requires a
 * password rejects the attempt here with NOAUTH, inside the failed-AUTH limit.
 */
async function connect(options: AuthProbeOptions): Promise<AuthProbe> {
  const client = new Valkey({
    host: socketHost(options.host),
    port: options.port,
    family: 0,
    tls: tlsOptions(options),
    lazyConnect: true,
    connectTimeout: CONNECT_TIMEOUT_MS,
    commandTimeout: COMMAND_TIMEOUT_MS,
    retryStrategy: () => null,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    enableReadyCheck: false,
    autoResubscribe: false,
  })
  // iovalkey reports socket failures (refused, timeout, TLS) as `error`
  // events and then rejects `connect()` with a generic message. Keep the
  // first event, which names the cause.
  let socketError: Error | undefined
  client.on("error", (err: Error) => { socketError ??= err })

  const close = () => client.disconnect()
  try {
    await client.connect()
    const { credentials } = options
    if (!credentials) await client.call("PING")
    else if (credentials.username) await client.call("AUTH", credentials.username, credentials.password)
    else await client.call("AUTH", credentials.password)
  } catch (err) {
    close()
    throw socketError ?? err
  }

  return {
    info: async (sections) => String(await client.call("INFO", ...sections)),
    customCommand: ([command, ...args]) => client.call(command, ...args),
    close,
  }
}

const internals = { connect }

/** Prove the credentials in `options` on one node. See the module comment for why this is not Glide. */
export const openAuthProbe = (options: AuthProbeOptions): Promise<AuthProbe> => internals.connect(options)

export { internals as __test__ }

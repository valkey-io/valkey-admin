import { GlideClient, GlideClusterClient, InfoOptions, ServerCredentials } from "@valkey/valkey-glide"
import * as R from "ramda"
import WebSocket from "ws"
import { VALKEY } from "../../../common/src/constants"
import { parseInfo, resolveHostnameOrIpAddress } from "./utils"
import { sanitizeUrl } from "../../../common/src/url-utils.ts"
import { type KeyEvictionPolicy } from "../../../common/src/constants"
import { checkJsonModuleAvailability } from "./check-json-module.ts"
import { type ConnectionDetails } from "./actions/connection.ts"

export async function connectToValkey(
  ws: WebSocket,
  payload: {
    connectionDetails: ConnectionDetails
    connectionId: string;
  },
  clients: Map<string, GlideClient | GlideClusterClient>,
) {

  const addresses = [
    {
      host: payload.connectionDetails.host,
      port: Number(payload.connectionDetails.port),
    },
  ]
  const credentials: ServerCredentials | undefined = 
    payload.connectionDetails.password ? {
      username: payload.connectionDetails.username,
      password: payload.connectionDetails.password,
    } : undefined

  try {
    // If we've connected to the same host using IP addr or vice versa, return
    returnIfDuplicateConnection(payload, clients, ws)
    const standaloneClient = await GlideClient.createClient({
      addresses,
      credentials,
      useTLS: payload.connectionDetails.tls,
      ...(payload.connectionDetails.verifyTlsCertificate === false && {
        advancedConfiguration: {
          tlsAdvancedConfiguration: {
            insecure: true,
          },
        },
      }),

      requestTimeout: 5000,
      clientName: "test_client",
    })
    clients.set(payload.connectionId, standaloneClient)
    
    const evictionPolicyResponse = await standaloneClient.customCommand(["CONFIG", "GET", "maxmemory-policy"]) as [{key: string, value: string}]
    const keyEvictionPolicy: KeyEvictionPolicy = evictionPolicyResponse[0].value.toLowerCase() as KeyEvictionPolicy
    const jsonModuleAvailable = await checkJsonModuleAvailability(standaloneClient)
    
    if (await belongsToCluster(standaloneClient)) {
      return connectToCluster(standaloneClient, ws, clients, payload, addresses, credentials, keyEvictionPolicy, jsonModuleAvailable)
    }
    // Need to repeat connection info for metrics server
    const connectionInfo = {
      type: VALKEY.CONNECTION.standaloneConnectFulfilled,
      payload: {
        connectionId: payload.connectionId,
        connectionDetails: {
          ...payload.connectionDetails,
          keyEvictionPolicy,
          jsonModuleAvailable,
        },
      },
    }
    // Send standalone details if node isn't part of a cluster
    process.send?.(connectionInfo)
    console.log("Connected to standalone")

    ws.send(
      JSON.stringify(connectionInfo),
    )
    return standaloneClient

  } catch (err) {
    console.log("Error connecting to Valkey", err)
    ws.send(
      JSON.stringify({
        type: VALKEY.CONNECTION.connectRejected,
        payload: {
          err,
          connectionId: payload.connectionId,
        },
      }),
    )
    return undefined
  }
}

async function belongsToCluster(client: GlideClient): Promise<boolean> {
  const response = await client.info([InfoOptions.Cluster])
  const parsed = parseInfo(response)
  return parsed["cluster_enabled"] === "1"
}

async function discoverCluster(client: GlideClient, payload: {
  connectionDetails: ConnectionDetails
  connectionId: string;
})  {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await client.customCommand(["CLUSTER", "SLOTS"]) as any[][]

    const { clusterId } = R.applySpec({
      firstSlotRange: R.nth(0),
      firstPrimaryNode: R.path([0, 2]), // firstSlotRange[2]
      clusterId: R.path([0, 2, 2]), // firstPrimaryNode[2]
    })(response)

    const clusterNodes = response.reduce((acc, slotRange) => {
      const [, , ...nodes] = slotRange

      // transform CLUSTER from flat response into a nested structure (primaryNode → replicas[])
      const [primaryHost, primaryPort] = nodes[0]
      const primaryKey = sanitizeUrl(`${primaryHost}-${primaryPort}`)

      if (!acc[primaryKey]) {
        acc[primaryKey] = {
          host: primaryHost,
          port: primaryPort,
          ...(payload.connectionDetails.password && {
            username: payload.connectionDetails.username,
            password: payload.connectionDetails.password,
          }),
          tls: payload.connectionDetails.tls,
          verifyTlsCertificate: payload.connectionDetails.verifyTlsCertificate,
          replicas: [],
        }
      }
      // add replicas under their primary
      nodes.slice(1).forEach(([host, port, id]) => {
        const replica = { id, host, port }
        // avoid duplicates
        if (!acc[primaryKey].replicas.some((r) => r.id === id)) {
          acc[primaryKey].replicas.push(replica)
        }
      })

      return acc
    }, {} as Record<string, {
      host: string;
      port: number;
      username?: string, 
      password?: string,
      tls: boolean,
      verifyTlsCertificate: boolean,
      replicas: { id: string; host: string; port: number }[];
    }>)

    return { clusterNodes, clusterId }
  } catch (err) {
    console.error("Error discovering cluster:", err)
    throw new Error("Failed to discover cluster") 
    
  }
}

async function connectToCluster(
  standaloneClient: GlideClient,
  ws: WebSocket,
  clients: Map<string, GlideClient | GlideClusterClient>,
  payload: { connectionDetails: ConnectionDetails, connectionId: string;},
  addresses: { host: string, port: number }[],
  credentials: ServerCredentials | undefined,
  keyEvictionPolicy: KeyEvictionPolicy,
  jsonModuleAvailable: boolean,
) {
  standaloneClient.customCommand(["CONFIG", "SET", "cluster-announce-hostname", addresses[0].host])
  const { clusterNodes, clusterId } = await discoverCluster(standaloneClient, payload)
  if (R.isEmpty(clusterNodes)) {
    throw new Error("No cluster nodes discovered")
  }
  // May remove this if we agree to remove clusterSlice
  ws.send(
    JSON.stringify({
      type: VALKEY.CLUSTER.addCluster,
      payload: { clusterId, clusterNodes },
    }),
  )
  const clusterClient = await GlideClusterClient.createClient({
    addresses,
    credentials,
    useTLS: payload.connectionDetails.tls,
    ...(payload.connectionDetails.verifyTlsCertificate === false && {
      advancedConfiguration: {
        tlsAdvancedConfiguration: {
          insecure: true,
        },
      },
    }),
    requestTimeout: 5000,
    clientName: "cluster_client",
  })

  standaloneClient.close()

  clients.set(payload.connectionId, clusterClient)

  const clusterSlotStatsResponse = await clusterClient.customCommand(
    ["CONFIG", "GET", "cluster-slot-stats-enabled"],
  ) as [Record<string, string>]
  const clusterSlotStatsEnabled = clusterSlotStatsResponse[0].value === "yes" 
  const clusterConnectionInfo = {
    type: VALKEY.CONNECTION.clusterConnectFulfilled,
    payload: {
      connectionId: payload.connectionId,
      clusterNodes,
      clusterId,
      address: addresses[0],
      credentials,
      keyEvictionPolicy,
      clusterSlotStatsEnabled,
      jsonModuleAvailable,
    },
  }

  process.send?.(clusterConnectionInfo)

  ws.send(
    JSON.stringify(clusterConnectionInfo),
  )
  return clusterClient
}

export async function returnIfDuplicateConnection(
  payload:{connectionId: string, connectionDetails: ConnectionDetails}, 
  clients: Map<string, GlideClient | GlideClusterClient>,
  ws: WebSocket) 
{
  const resolvedAddresses = (await resolveHostnameOrIpAddress(payload.connectionDetails.host)).addresses
  if (resolvedAddresses.some((address) => clients.has(sanitizeUrl(`${address}:${payload.connectionDetails.port}`)))) {
    return ws.send(
      JSON.stringify({
        type: VALKEY.CONNECTION.standaloneConnectFulfilled,
        payload: { connectionId: payload.connectionId },
      }),
    )
  }
}

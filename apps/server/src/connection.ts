import { GlideClient, GlideClusterClient, InfoOptions } from "@valkey/valkey-glide"
import * as R from "ramda"
import WebSocket from "ws"
import { VALKEY } from "../../../common/src/constants"
import { parseInfo } from "./utils"

export async function connectToValkey(
  ws: WebSocket,
  payload: {
    host: string;
    port: number;
    connectionId: string;
  },
  clients: Map<string, GlideClient | GlideClusterClient>,
) {

  const addresses = [
    {
      host: payload.host,
      port: payload.port,
    },
  ]
  try {
    const standaloneClient = await GlideClient.createClient({
      addresses,
      requestTimeout: 5000,
      clientName: "test_client",
    })

    console.log("Connected to standalone")
    clients.set(payload.connectionId, standaloneClient)

    const connectionInfo = {
      type: VALKEY.CONNECTION.standaloneConnectFulfilled,
      payload: {
        connectionId: payload.connectionId,
        connectionDetails: {
          host: payload.host,
          port: payload.port,
        },
      },
    }
    ws.send(
      JSON.stringify(connectionInfo),
    )

    if (await belongsToCluster(standaloneClient)) {
      return connectToCluster(standaloneClient, ws, clients, payload, addresses)
    }
    // Send standalone details if node isn't part of a cluster
    process.send?.(connectionInfo)
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

async function discoverCluster(client: GlideClient) {
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
      const primaryKey = `${primaryHost}-${primaryPort}`

      if (!acc[primaryKey]) {
        acc[primaryKey] = {
          host: primaryHost,
          port: primaryPort,
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
  payload: { host: string; port: number; connectionId: string;},
  addresses: { host: string, port: number | undefined }[],
) {
  const { clusterNodes, clusterId } = await discoverCluster(standaloneClient)
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
    requestTimeout: 5000,
    clientName: "cluster_client",
  })

  standaloneClient.close()

  clients.set(payload.connectionId, clusterClient)

  const clusterConnectionInfo = {
    type: VALKEY.CONNECTION.clusterConnectFulfilled,
    payload: {
      connectionId: payload.connectionId,
      clusterNodes,
      clusterId,
    },
  }

  process.send?.(clusterConnectionInfo)

  ws.send(
    JSON.stringify(clusterConnectionInfo),
  )
  return clusterClient
}

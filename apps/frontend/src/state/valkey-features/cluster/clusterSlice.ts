import { createSlice } from "@reduxjs/toolkit"
import * as R from "ramda"

export interface ReplicaNode {
  id: string;
  host: string;
  port: number;
}

export interface PrimaryNode {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls: boolean;
  verifyTlsCertificate: boolean
  //TODO: Add handling and UI for uploading cert
  caCertPath?: string
  replicas: ReplicaNode[];
}

export interface ParsedNodeInfo {
  server_name: string | null;
  uptime_in_days: string | null;
  tcp_port: string | null;
  used_memory_human: string | null;
  used_cpu_sys: string | null;
  instantaneous_ops_per_sec: string | null;
  total_commands_processed: string | null;
  role: string | null;
  connected_clients: string | null;
}

interface ClusterState {
  [clusterId: string]: {
    clusterNodes: Record<string, PrimaryNode>;
    data: {
      [nodeAddress: string]: ParsedNodeInfo;
    };
    searchableText: {
      [nodeAddress: string]: string;
    };
  };
}
const initialClusterState: ClusterState = {}

const clusterSlice = createSlice({
  name: "valkeyCluster",
  initialState: {
    clusters: initialClusterState as ClusterState,
  },
  reducers: {
    addCluster: (state, action) => {
      const { clusterId, clusterNodes } = action.payload
      if (!state.clusters[clusterId]) {
        state.clusters[clusterId] = {
          clusterNodes: {},
          data: {},
          searchableText: {},
        }
      }
      state.clusters[clusterId].clusterNodes = clusterNodes
    },
    updateClusterInfo: (state, action) => {
      const { clusterId, clusterNodes } = action.payload
      if (state.clusters[clusterId]) {
        state.clusters[clusterId].clusterNodes = clusterNodes
      }
    },
    removeCluster: (state, action) => {
      delete state.clusters[action.payload.clusterId]
    },
    setClusterData: (state, action) => {
      const { clusterId, info } = action.payload

      if (!state.clusters[clusterId]) return

      const parseNodeInfo = R.applySpec({
        server_name: R.path(["Server", "server_name"]),
        uptime_in_days: R.path(["Server", "uptime_in_days"]),
        tcp_port: R.path(["Server", "tcp_port"]),
        used_memory_human: R.path(["Memory", "used_memory_human"]),
        used_cpu_sys: R.path(["CPU", "used_cpu_sys"]),
        instantaneous_ops_per_sec: R.path(["Stats", "instantaneous_ops_per_sec"]),
        total_commands_processed: R.path(["Stats", "total_commands_processed"]),
        role: R.path(["Replication", "role"]),
        connected_clients: R.path(["Clients", "connected_clients"]),
      })

      const result: ClusterState[string]["data"] = {}

      for (const [nodeAddress, nodeInfo] of Object.entries(info)) {
        result[nodeAddress] = parseNodeInfo(nodeInfo) as ParsedNodeInfo
      }
      state.clusters[clusterId].data = result

      // Precompute searchable text for both primaries and replicas
      const searchableText: Record<string, string> = {}
      for (const [primaryKey, primary] of Object.entries(state.clusters[clusterId].clusterNodes)) {
        const primaryData = result[primaryKey]
        searchableText[primaryKey] = [
          primaryKey,
          primary.host,
          primary.port.toString(),
          primaryData?.server_name || "",
        ].join(" ").toLowerCase()

        for (const replica of primary.replicas) {
          const replicaKey = `${replica.host}:${replica.port}`
          const replicaData = result[replicaKey]
          searchableText[replicaKey] = [
            replicaKey,
            replica.host,
            replica.port.toString(),
            replicaData?.server_name || "",
          ].join(" ").toLowerCase()
        }
      }
      state.clusters[clusterId].searchableText = searchableText
    },
  },
})

export default clusterSlice.reducer
export const {
  addCluster,
  updateClusterInfo,
  removeCluster,
  setClusterData,
} = clusterSlice.actions

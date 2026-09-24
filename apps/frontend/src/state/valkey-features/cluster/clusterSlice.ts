import { createAction, createSlice, current } from "@reduxjs/toolkit"
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
  tls: boolean;
  verifyTlsCertificate: boolean
  //TODO: Add handling and UI for uploading cert
  caCertPath?: string
  replicas: ReplicaNode[];
  authType?: "password" | "iam" | "gcp-iam";
  awsRegion?: string;
  awsReplicationGroupId?: string;
}

export type NodeRole = "primary" | "replica"

export interface NodeRow {
  dataKey: string;
  searchKey: string;
  host: string;
  port: number;
  role: NodeRole;
  primary: PrimaryNode;
  isGroupEnd: boolean;
}

export interface ParsedNodeInfo {
  uptime_in_days: string | null;
  tcp_port: string | null;
  used_memory_human: string | null;
  used_memory: string | null;
  maxmemory: string | null;
  used_cpu_sys: string | null;
  instantaneous_ops_per_sec: string | null;
  total_commands_processed: string | null;
  role: string | null;
  connected_clients: string | null;
  keyspace_hits: string | null;
  keyspace_misses: string | null;
}

export type MemoryBasis = "maxmemory" | "total_system_memory" | "none"

export interface NodeUtilization {
  nodeId: string;
  memory_utilization_percent: number | null;
  memory_basis: MemoryBasis;
  used_memory: number | null;
  memory_limit_bytes: number | null;
  cpu_utilization_percent: number | null;
  cpu_sample_interval_seconds: number | null;
  warnings: string[];
}

interface ClusterState {
  [clusterId: string]: {
    clusterNodes: Record<string, PrimaryNode>;
    data: {
      [nodeAddress: string]: ParsedNodeInfo;
    };
    utilization: {
      [nodeAddress: string]: NodeUtilization;
    };
    searchableText: {
      [nodeAddress: string]: string;
    };
  };
}
const initialClusterState: ClusterState = {}

export const updateClusterData = createAction<{connectionId: string, clusterId: string}>("updateClusterData")
export const stopClusterDataPolling = createAction<{clusterId: string}>("stopClusterDataPolling")

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
          utilization: {},
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
      const { clusterId, info, utilization, clusterNodes } = action.payload

      if (!state.clusters[clusterId]) return

      if (clusterNodes && !R.equals(current(state.clusters[clusterId].clusterNodes), clusterNodes)) {
        state.clusters[clusterId].clusterNodes = clusterNodes
      }

      const parseNodeInfo = R.applySpec({
        uptime_in_days: R.path(["Server", "uptime_in_days"]),
        tcp_port: R.path(["Server", "tcp_port"]),
        used_memory_human: R.path(["Memory", "used_memory_human"]),
        used_memory: R.path(["Memory", "used_memory"]),
        maxmemory: R.path(["Memory", "maxmemory"]),
        used_cpu_sys: R.path(["CPU", "used_cpu_sys"]),
        instantaneous_ops_per_sec: R.path(["Stats", "instantaneous_ops_per_sec"]),
        total_commands_processed: R.path(["Stats", "total_commands_processed"]),
        role: R.path(["Replication", "role"]),
        connected_clients: R.path(["Clients", "connected_clients"]),
        keyspace_hits: R.path(["Stats", "keyspace_hits"]),
        keyspace_misses: R.path(["Stats", "keyspace_misses"]),
      })

      const result: ClusterState[string]["data"] = {}

      for (const [nodeAddress, nodeInfo] of Object.entries(info)) {
        result[nodeAddress] = parseNodeInfo(nodeInfo) as ParsedNodeInfo
      }
      state.clusters[clusterId].data = result
      state.clusters[clusterId].utilization = utilization ?? {}

      // Precompute searchable text for both primaries and replicas
      const searchableText: Record<string, string> = {}
      for (const [primaryKey, primary] of Object.entries(state.clusters[clusterId].clusterNodes)) {
        searchableText[primaryKey] = [
          primaryKey,
          primary.host,
          primary.port.toString(),
        ].join(" ").toLowerCase()

        for (const replica of primary.replicas) {
          const replicaKey = `${replica.host}:${replica.port}`
          searchableText[replicaKey] = [
            replicaKey,
            replica.host,
            replica.port.toString(),
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

import { VALKEY } from "@common/src/constants"
import { createSlice } from "@reduxjs/toolkit"
import type { RootState } from "@/store"
export const selectClusters = (state: RootState) => state[VALKEY.CLUSTER.name].clusters

interface ReplicaNode {
  id: string;
  host: string;
  port: number;
}

interface MasterNode {
  host: string;
  port: number;
  replicas: ReplicaNode[];
}

interface ClusterState {
  [clusterId: string]: {
    nodes: Record<string, MasterNode>;
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
      const { clusterId, nodes } = action.payload
      state.clusters[clusterId] = { nodes }
    },
    updateClusterInfo: (state, action) => {
      const { clusterId, nodes } = action.payload
      if (state.clusters[clusterId]) {
        state.clusters[clusterId].nodes = nodes
      }
    },
    removeCluster: (state, action) => {
      delete state.clusters[action.payload.clusterId]
    },
  },
})

export default clusterSlice.reducer
export const {
  addCluster,
  updateClusterInfo,
  removeCluster,
} = clusterSlice.actions

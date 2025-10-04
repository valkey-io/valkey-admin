import { createSlice } from "@reduxjs/toolkit"
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
  initialState: initialClusterState,
  reducers: {
    addCluster: (state, action) => {
      const { clusterId, nodes } = action.payload
      state[clusterId] = { nodes }
    },
    updateClusterInfo: (state, action) => {
      const { clusterId, nodes } = action.payload
      if (state[clusterId]) {
        state[clusterId].nodes = nodes
      }
    },
    removeCluster: (state, action) => {
      delete state[action.payload.clusterId]
    },
  },
})

export default clusterSlice.reducer
export const {
  addCluster,
  updateClusterInfo,
  removeCluster,
} = clusterSlice.actions

import { VALKEY } from "@common/src/constants.ts"
import * as R from "ramda"
import type { RootState } from "@/store.ts"

export const selectClusterData = (id: string) => (state: RootState) =>
  R.path([VALKEY.CLUSTER.name, "clusters", id, "data"], state)

export const selectClusterNodes = (id: string) => (state: RootState) => 
  R.path([VALKEY.CLUSTER.name, "clusters", id, "clusterNodes"], state)

export const selectCluster = (id: string) => (state: RootState) =>
  R.path([VALKEY.CLUSTER.name, "clusters", id], state)

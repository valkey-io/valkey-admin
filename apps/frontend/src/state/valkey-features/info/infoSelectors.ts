import { VALKEY } from "@common/src/constants.ts"
import * as R from "ramda"
import type { RootState } from "@/store.ts"

export const selectData = (id: string) => (state: RootState) =>
  R.path([VALKEY.STATS.name, id, "data"], state)


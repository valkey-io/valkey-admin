import type { RootState } from "@/store.ts";
import {VALKEY} from "@common/src/constants.ts"

export const selectData = (state: RootState) => state[VALKEY.STATS.name].data
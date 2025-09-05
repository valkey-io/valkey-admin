import type { RootState } from "@/store.ts"
import {VALKEY} from "@common/src/constants.ts"
import * as R from "ramda"
import type {CommandMetadata} from "@/state/valkey-features/command/commandSlice.ts"

export const getNth = (index: number = 0, id: string) => (state: RootState) =>
    R.pipe(
        R.path([VALKEY.COMMAND.name, id, "commands", index]),
        R.defaultTo({} as CommandMetadata),
    )(state)

export const selectAllCommands = (id: string) => (state: RootState) =>
  R.path([VALKEY.COMMAND.name, id, "commands"], state)

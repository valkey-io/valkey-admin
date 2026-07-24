import { PERSISTED_COMMANDS_LIMIT, VALKEY } from "@common/src/constants.ts"
import * as R from "ramda"
import type { RootState } from "@/store.ts"
import type { CommandMetadata } from "@/state/valkey-features/command/commandSlice.ts"

export const getNth = (index: number = 0, id: string) => (state: RootState) =>
  R.pipe(
    R.path([VALKEY.COMMAND.name, "connections", id, "commands", index]),
    R.defaultTo({} as CommandMetadata),
  )(state)

export const selectAllCommands = (id: string) => (state: RootState) =>
  R.path([VALKEY.COMMAND.name, "connections", id, "commands"], state)

export const selectCommandHistoryLimit = (state: RootState): number =>
  R.pathOr(PERSISTED_COMMANDS_LIMIT, [VALKEY.COMMAND.name, "limit"], state)

import type { RootState } from "@/store.ts"
import {VALKEY} from "@common/src/constants.ts"
import * as R from "ramda"

const getNth = (index?: number) =>
    R.pipe(
        R.path([VALKEY.COMMAND.name, "commands"]),
        index ? R.nth(index) : R.last,
    )

export const selectResponse = (index?: number) => (state: RootState) =>
    R.pipe(
        getNth(index),
        R.prop("response"),
    )(state)

export const selectError = (index?: number) => (state: RootState) =>
    R.pipe(
        getNth(index),
        R.prop("error"),
    )(state)
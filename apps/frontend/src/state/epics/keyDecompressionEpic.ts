import { merge, Observable, EMPTY } from "rxjs"
import { catchError, filter, mergeMap, takeUntil, tap } from "rxjs/operators"
import { detectCompressionCodec } from "@common/src/compression"
import { getSocket } from "./wsEpics"
import {
  decompressCleared,
  decompressFailed,
  decompressFulfilled,
  rawValueFulfilled,
  rawValueRequested,
  type DecompressionEntry
} from "../valkey-features/keys/keyDecompressionSlice"
import { selectKeyDecompression } from "../valkey-features/keys/keyDecompressionSelectors"
import { action$, select, selectMany } from "../middleware/rxjsMiddleware/rxjsMiddleware"
import type { PayloadAction, Store } from "@reduxjs/toolkit"
import { base64ToBytes, decompress } from "@/lib/decompression"
import { renderDecompressed } from "@/lib/decompression/render"

type RawValue = ReturnType<typeof rawValueFulfilled>["payload"]

/**
 * Decodes a fetched value and prepares its preview. Resolves to undefined when cancelled.
 */
async function decodeRawValue(
  raw: RawValue, entry: DecompressionEntry, signal: AbortSignal,
): Promise<PayloadAction<unknown> | undefined> {
  const target = { connectionId: raw.connectionId, key: raw.key, requestId: raw.requestId }
  const bytes = base64ToBytes(raw.base64)
  const codec = entry.codecChoice === "auto" ? detectCompressionCodec(bytes) : entry.codecChoice
  if (!codec) {
    return decompressFailed({ ...target, error: "No known compression format was detected. Choose one from the list." })
  }

  const limit = entry.outputLimit ?? raw.maxOutputBytes
  const outcome = await decompress(bytes, codec, { maxOutputBytes: limit, signal })
  if (outcome.kind === "cancelled") return undefined
  if (outcome.kind === "failed") return decompressFailed({ ...target, error: outcome.error })

  const preview = renderDecompressed(outcome.output, {
    truncated: outcome.truncated, previewMaxBytes: raw.previewMaxBytes, previewStart: entry.previewStart,
  })
  return decompressFulfilled({
    ...target,
    result: {
      codec,
      ...preview,
      outputBytes: outcome.output.length,
      inputBytes: raw.byteLength,
      truncated: outcome.truncated,
      ...(outcome.declaredSize !== undefined ? { declaredSize: outcome.declaredSize } : {}),
      outputLimit: limit,
      maxOutputBytes: raw.maxOutputBytes,
    },
  })
}

export const keyDecompressionEpic = (store: Store) =>
  merge(
    action$.pipe(
      select(rawValueRequested),
      tap((action) => getSocket().next(action)),
    ),

    action$.pipe(
      select(rawValueFulfilled),
      mergeMap(({ payload }) => {
        const entry = selectKeyDecompression(payload.connectionId, payload.key)(store.getState())
        // A newer request or a cancel superseded this reply.
        if (entry?.requestId !== payload.requestId) return EMPTY

        const sameKey = (action: PayloadAction<{ connectionId: string; key: string }>) =>
          action.payload.connectionId === payload.connectionId && action.payload.key === payload.key

        return new Observable<PayloadAction<unknown>>((subscriber) => {
          const controller = new AbortController()
          decodeRawValue(payload, entry, controller.signal).then(
            (action) => {
              if (action) subscriber.next(action)
              subscriber.complete()
            },
            (err) => subscriber.error(err),
          )
          return () => controller.abort()
        }).pipe(
          takeUntil(action$.pipe(selectMany(rawValueRequested, decompressCleared), filter(sameKey))),
          catchError((err) => [decompressFailed({
            connectionId: payload.connectionId,
            key: payload.key,
            requestId: payload.requestId,
            error: `Decompression failed: ${err instanceof Error ? err.message : String(err)}`,
          })]),
        )
      }),
      tap((action) => store.dispatch(action)),
    ),
  )

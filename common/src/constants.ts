const commonDefs = {
    setError: "error",
} as const

type WithError<T extends Record<string, string>> = { setError: "error" } & T

export const makeNamespace = <
    const Prefix extends string,
    const Defs extends Record<string, string>
>(
    name: Prefix,
    defs: Defs
) =>
    ({
        name,
        ...Object.fromEntries(
            Object.entries({ ...commonDefs, ...defs } as WithError<Defs>)
                .map(([k, v]) => [k, `${name}/${v}` as const])
        ),
    }) as {
        name: Prefix
    } & { [K in keyof WithError<Defs>]: `${Prefix}/${WithError<Defs>[K]}` }

export const VALKEY = {
    CONNECTION: makeNamespace("valkeyConnection", {
        setConnecting: "setConnecting",
        setConnected:  "setConnected",
    } as const),
    COMMAND: makeNamespace("valkeyCommand", {
        sendFailed:     "sendFailed",
        sendFulfilled:  "sendFulfilled",
        sendPending:    "sendPending",
    } as const),
    STATS: makeNamespace("valkeyStats", {
        setData: "setData",
    } as const),
} as const

import { WebSocketServer, WebSocket } from "ws"
import { GlideClient, Decoder } from "@valkey/valkey-glide"
import { VALKEY } from "../../../common/src/constants.ts"

const wss = new WebSocketServer({ port: 8080 })

console.log("Websocket server running on localhost:8080")

wss.on('connection', (ws: WebSocket) => {
    console.log("Client connected.")
    let client: GlideClient | undefined;

    ws.on('message', async (message) => {
        const action = JSON.parse(message.toString());
        console.log("on message", action.type === VALKEY.CONNECTION.setConnecting, action)

        if (action.type === VALKEY.CONNECTION.setConnecting) {
            client = await connectToValkey(ws, action.payload)
        }
        if (action.type === VALKEY.COMMAND.sendPending && client) {
            await sendValkeyRunCommand(client, ws, action.payload)
        }
        if (action.type === VALKEY.STATS.setData && client) {
            console.log("here now")
            setDashboardData(client, ws)
        }
    })
    ws.onerror = (err) => {
        console.error("WebSocket error:", err);
    }

    ws.on('close', (code, reason) => {
        if (client) {
            client.close()
        }
        console.log("Client disconnected. Reason: ", code, reason.toString())
    })

})

async function connectToValkey(ws: WebSocket, payload: { host: string, port: number }) {
    const addresses = [
        {
            host: payload.host,
            port: payload.port,
        },
    ]
    try {
        const client = await GlideClient.createClient({
            addresses,
            requestTimeout: 5000,
            clientName: "test_client"
        })

        ws.send(JSON.stringify({
            type: VALKEY.CONNECTION.setConnected,
            payload: {
                status: true,
            },
        }))

        return client;
    }
    catch (err) {
        console.log("Error connecting to Valkey", err)
        ws.send(JSON.stringify({
            type: VALKEY.CONNECTION.setError,
            payload: err
        }))
    }
}

async function setDashboardData(client: GlideClient, ws: WebSocket) {
    const rawInfo = await client.info();
    const info = parseInfo(rawInfo);
    const rawMemoryStats = await client.customCommand(
        ["MEMORY", "STATS"],
        { decoder: Decoder.String }
    ) as Array<{ key: string; value: string }>

    const memoryStats = rawMemoryStats.reduce((acc, { key, value }) => {
        acc[key] = value
        return acc
    }, {} as Record<string, string>)

    ws.send(JSON.stringify({
        type: VALKEY.STATS.setData,
        payload: {
            info: info,
            memory: memoryStats,
        },
    }));
}

const parseInfo = (infoStr: string): Record<string, string> =>
    infoStr
        .split('\n')
        .reduce((acc, line) => {
            if (!line || line.startsWith('#') || !line.includes(':')) return acc;
            const [key, value] = line.split(':').map(part => part.trim());
            acc[key] = value;
            return acc;
        }, {} as Record<string, string>);

async function sendValkeyRunCommand(client: GlideClient, ws: WebSocket, payload: { command: string }) {
    try {
        const rawResponse = await client.customCommand(payload.command.split(" ")) as string;
        const response = parseInfo(rawResponse)
        console.log("Raw response is: ", rawResponse)
        if (rawResponse.includes("ResponseError")) {
            ws.send(JSON.stringify({
                meta: { command: payload.command },
                type: VALKEY.COMMAND.sendFailed,
                payload: rawResponse
            }))
        }
        ws.send(JSON.stringify({
            meta: { command: payload.command },
            type: VALKEY.COMMAND.sendFulfilled,
            payload: response
        }))
    } catch (err) {
        ws.send(JSON.stringify({
            meta: { command: payload.command },
            type: VALKEY.COMMAND.sendFailed,
            payload: err
        }))
        console.log("Error sending command to Valkey", err)
    }
}

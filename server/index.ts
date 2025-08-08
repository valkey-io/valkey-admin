import { WebSocketServer, WebSocket } from "ws";
import { GlideClient } from "@valkey/valkey-glide";
import { setConnecting, setConnected, setError } from "../src/features/valkeyconnection/valkeyConnectionSlice.ts"
import { sendFulfilled, sendFailed, sendPending } from "../src/features/valkeycommand/valkeycommandSlice.ts";

const wss = new WebSocketServer({ port: 8080 })

console.log("Websocket server running on localhost:8080")

wss.on('connection', (ws: WebSocket) => {
    console.log("Client connected.")
    let client: GlideClient | undefined;

    ws.on('message', async (message) => {
        const action = JSON.parse(message.toString());
        console.log("Received message from client: ", message.toString())
        if (action.type === setConnecting.type) {
            client = await connectToValkey(ws, action.payload)
        }
        if (action.type === sendPending.type && client) {
            await sendValkeyRunCommand(client, ws, action.payload)
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

async function connectToValkey(ws: WebSocket, payload) {
    const addresses = [
        {
            host: payload.host,
            port: payload.port,
        },
    ];
    try {
        const client = await GlideClient.createClient({
            addresses,
            requestTimeout: 5000,
            clientName: "test_client"
        })

        const info = await client.info();

        console.log("Connected to Valkey")

        ws.send(JSON.stringify({
            type: setConnected.type,
            payload: {
                status: true,
                info: info
            },
        }));

        return client;
    }
    catch (err) {
        console.log("Error connecting to Valkey", err)
        ws.send(JSON.stringify({
            type: setError.type,
            payload: err
        }))
    }
}

async function sendValkeyRunCommand(client: GlideClient, ws: WebSocket, payload) {
    try {
        const response = await client.customCommand(payload.command.split(" "));
        ws.send(JSON.stringify({
            type: sendFulfilled.type,
            payload: response
        }))
    } catch (err) {
        ws.send(JSON.stringify({
            type: sendFailed.type,
            payload: err
        }))
        console.log("Error sending command to Valkey", err)
    }

}

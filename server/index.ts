import { WebSocketServer, WebSocket } from "ws";
import { GlideClient } from "@valkey/valkey-glide";

const wss = new WebSocketServer({ port: 8080 })

console.log("Websocket server running on localhost:8080")

wss.on('connection', (ws: WebSocket) => {
    console.log("Client connected.")
    let client: GlideClient | undefined;

    ws.on('message', async (message) => {
        const action = JSON.parse(message.toString());
        if (action.type === 'valkeyconnection/setConnecting') {

            client = await connectToValkey(ws, action.payload)
        }
    })
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
            type: "valkeyconnection/setConnected",
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
            type: "valkey-status",
            message: "Failed to connect to Valkey",
            error: err
        }))
    }
}

// async function sendValkeyRunCommand(client: GlideClient, ws: WebSocket, payload) {

//     const response = await client.customCommand(payload.command.split(" "));

//     ws.send(JSON.stringify({
//         type: "valkey-response",
//         message: response
//     }))

// }

import { type PayloadAction, type Middleware } from '@reduxjs/toolkit';
import { setConnected, setError } from '@/state/wsconnection/wsConnectionSlice.ts';

let socket: WebSocket | null = null;

export const wsMiddleware: Middleware = store => next => (action) => {
    const typedAction = action as PayloadAction
    const actionType = typedAction.type
    if (actionType === "wsconnection/setConnecting") {
        try {
            socket = new WebSocket("ws://localhost:8080");
            socket.onopen = () => {
                store.dispatch(setConnected(true));
                console.log("Connected to server")
            }

            socket.onmessage = (message) => {
                store.dispatch(message.data)
            }

            socket.onclose = () => {
                console.log('WebSocket closed');
                store.dispatch(setConnected(false));
            };
        }
        catch (e) {
            store.dispatch(setError(e));
        }
        return next(action);
    }
    return next(action);
}


export function getSocket(): WebSocket {
    if (!socket) {
        throw new Error("WebSocket is not connected");
    }
    return socket;
}

import { type PayloadAction, type Middleware } from '@reduxjs/toolkit';
import { setError as setError, selectConnected, selectConnecting, setConnecting, setConnected } from '../../features/valkeyconnection/valkeyConnectionSlice';
import { getSocket } from '../ws/wsMiddleware';
import { sendFailed, sendFulfilled, sendPending } from '../../features/valkeycommand/valkeycommandSlice';

export const valkeyMiddleware: Middleware = store => next => async (action) => {
    const socket = getSocket();
    const typedAction = action as PayloadAction
    if (typedAction.type === setConnecting.type) {
        try {
            const canAttemptConnection = !selectConnected(store.getState()) && !selectConnecting(store.getState())

            if (canAttemptConnection) {
                socket.send(JSON.stringify(typedAction))
            }

            socket.onmessage = (message) => {
                const action = JSON.parse(message.data);

                console.log("Connected to Valkey: ", action.payload.info)

                if (action.type === setConnected.type) {
                    store.dispatch(action)
                }
            }
        }
        catch (e) {
            store.dispatch(setError(e));
        }
        return next(action);
    }
    if (typedAction.type === sendPending.type) {
        try {
            socket.send(JSON.stringify(typedAction))

            console.log("Sending command to Valkey with payload: ", typedAction.payload)

            socket.onmessage = (message) => {
                const action = JSON.parse(message.data);

                console.log("Received response from Valkey: ", action.payload)

                if (action.type === sendFulfilled.type) {
                    store.dispatch(action)
                }
            }
        }
        catch (e) {
            store.dispatch(sendFailed(e));
        }
        return next(action);
    }
    return next(action);
}
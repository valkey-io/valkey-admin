import { type PayloadAction, type Middleware } from '@reduxjs/toolkit';
import { setError as setError, setConnecting, setConnected } from '@/state/valkey-features/connection/valkeyConnectionSlice.ts';
import { selectConnected, selectConnecting } from '../../valkey-features/connection/valkeyConnectionSelectors.ts'
import { getSocket } from '../ws/wsMiddleware.ts';
import { sendFailed, sendPending } from '@/state/valkey-features/command/valkeyCommandSlice.ts';
import { setData } from '@/state/valkey-features/info/valkeyInfoSlice.ts';
import { toast } from 'sonner';

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

                if (action.type === setConnected.type) {
                    store.dispatch(action)
                }

                if (action.type === setError.type) {
                    toast.error(action.payload.message)
                    store.dispatch(setError(action.payload));
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

                store.dispatch(action)

            }
        }
        catch (e) {
            store.dispatch(sendFailed(e));
        }
        return next(action);
    }
    if (typedAction.type === setConnected.type) {
        socket.send(JSON.stringify({ type: setData.type }))
        socket.onmessage = (message) => {
            const action = JSON.parse(message.data);

            if (action.type === setData.type) {
                store.dispatch(action)
            }
        }
    }
    return next(action);
}
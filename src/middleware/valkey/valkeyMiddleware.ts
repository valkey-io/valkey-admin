import { type PayloadAction, type Middleware } from '@reduxjs/toolkit';
import { setError as setError, selectConnected, selectConnecting } from '../../features/valkeyconnection/valkeyConnectionSlice';
import { socket } from '../ws/wsMiddleware';
import { setCommandError } from '../../features/valkeycommand/valkeycommandSlice';

function isSocketReady() {
    return socket != null && socket.readyState === WebSocket.OPEN
}

export const valkeyConnectMiddlware: Middleware = store => next => async (action) => {
    const typedAction = action as PayloadAction
    if (typedAction.type === 'valkeyconnection/setConnecting') {
        try {
            const canAttemptConnection = !selectConnected(store.getState()) && !selectConnecting(store.getState())

            if (canAttemptConnection) {
                socket.send(JSON.stringify(typedAction))
            }

            socket.onmessage = (message) => {
                const action = JSON.parse(message.data);

                console.log("Connected to Valkey: ", action.payload.info)

                if (action.type === 'valkeyconnection/setConnected') {
                    store.dispatch(action)
                }
            }
        }
        catch (e) {
            store.dispatch(setError(e));
        }
        return next(action);
    }
    return next(action);
}

export const valkeySendCommandMiddleware: Middleware = store => next => async (action) => {
    const typedAction = action as PayloadAction
    if (typedAction.type === 'valkeyconnection/sendCommand' && isSocketReady()) {
        try {
            socket.send(JSON.stringify(typedAction))
        }
        catch (e) {
            store.dispatch(setCommandError(e));
        }
        return next(action);
    }
    return next(action);
}

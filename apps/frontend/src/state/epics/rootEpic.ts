import { wsConnectionEpic } from './wsEpics';
import { connectionEpic, sendRequestEpic, setDataEpic } from './valkeyEpics';
import { merge } from 'rxjs'
import type { Store } from '@reduxjs/toolkit';
import { keyBrowserEpic } from './keyBrowserEpic';

export const registerEpics = (store: Store) => {
    merge(
        wsConnectionEpic(store),
        connectionEpic(store),
        sendRequestEpic(),
        setDataEpic(),
        keyBrowserEpic()
    ).subscribe({
        error: err => console.error('Epic error:', err),
    })
}
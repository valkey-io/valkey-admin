
import { useState } from 'react';
import { setConnecting as valkeySetConnecting, setConnected as valkeySetConnected, selectStatus, selectConnected } from './valkeyConnectionSlice';
import { useAppDispatch } from '../../hooks/hooks';
import { useSelector } from 'react-redux';
import { setLastCommand } from '../valkeycommand/valkeycommandSlice';

export function Connection() {
    const dispatch = useAppDispatch();
    const [host, setHost] = useState('localhost')
    const [port, setPort] = useState('6379')
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [text, setText] = useState('')

    const valkeyconnectionStatus = useSelector(selectStatus)
    const valkeyConnected = useSelector(selectConnected)

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        dispatch(valkeySetConnecting({ status: true, host, port, username, password }))
    }

    return (
        <div>
            <p>Connection status: {valkeyconnectionStatus} </p>
            {valkeyConnected ?
                <div>
                    <input type='text' value={text} onChange={(e) => setText(e.target.value)} />
                    <button onClick={() => dispatch(setLastCommand(text))}>Send</button>
                    <div>
                        <button onClick={() => dispatch(valkeySetConnected(false))}>Disconnect</button>
                    </div>
                </div>


                :
                <form onSubmit={handleSubmit}>
                    <div>
                        <label>Host *</label>
                        <input type="text" value={host} onChange={e => setHost(e.target.value)} required />
                    </div>
                    <div>
                        <label>Port *</label>
                        <input type="text" value={port} onChange={e => setPort(e.target.value)} required />
                    </div>
                    <div>
                        <label>Username (optional)</label>
                        <input type="text" value={username} onChange={e => setUsername(e.target.value)} />
                    </div>
                    <div>
                        <label>Password (optional):</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                    <div>
                        <button type="submit" >Connect</button>
                    </div>
                </form>
            }
        </div>

    )
}
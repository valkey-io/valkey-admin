
import { useState, useEffect } from 'react';
import { setRedirected, setConnecting as valkeySetConnecting } from '../../../../common/features/valkeyconnection/valkeyConnectionSlice';
import { selectConnected, selectRedirected } from '@/selectors/valkeyConnectionSelectors';
import { useAppDispatch } from '../hooks/hooks';
import { Button } from "./ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "./ui/card"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router';

export function Connection() {
    const dispatch = useAppDispatch();
    const navigate = useNavigate()
    const [host, setHost] = useState('localhost')
    const [port, setPort] = useState('6379')
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')

    const isConnected = useSelector(selectConnected)
    const hasRedirected = useSelector(selectRedirected)

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        dispatch(valkeySetConnecting({ status: true, host, port, username, password }))
    }

    useEffect(() => {
        if (isConnected && !hasRedirected) {
            dispatch(setRedirected(true))
            navigate('/dashboard')
        }
    }, [isConnected, navigate, hasRedirected, dispatch])

    return (

        <Card className="w-full max-w-sm flex items-center justify-center min-h-screen">
            <CardHeader>
                <CardTitle>Connect to Valkey</CardTitle>
                <CardDescription>
                    Enter your server's host and port to connect.
                </CardDescription>

            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit}>
                    <div className="flex flex-col gap-6">
                        <div className="grid gap-2">
                            <Label htmlFor="host">Host</Label>
                            <Input
                                id="host"
                                type="text"
                                value={host}
                                placeholder="localhost"
                                required
                                onChange={e => setHost(e.target.value)}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="port">Port</Label>
                            <Input
                                id="port"
                                type="number"
                                value={port}
                                placeholder="6379"
                                required
                                onChange={e => setPort(e.target.value)}
                            />
                        </div>
                        <div className="grid gap-2">
                            <div className="flex items-center">
                                <Label htmlFor="username">Username</Label>
                            </div>
                            <Input id="username" type="username" onChange={e => setUsername(e.target.value)} />
                        </div>
                        <div className="grid gap-2">
                            <div className="flex items-center">
                                <Label htmlFor="password">Password</Label>
                            </div>
                            <Input id="password" type="password" onChange={(e) => setPassword(e.target.value)} />
                        </div>
                    </div>
                    <div className="grid gap-2 mt-8">
                        <Button type="submit" className="w-full">
                            Connect
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>


    )
}
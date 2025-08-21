import {useRef, useState} from 'react'
import { useSelector } from 'react-redux'
import { sendPending } from '@/state/valkey-features/command/valkeyCommandSlice.ts'
import {selectError, selectResponse} from '@/state/valkey-features/command/valkeyCommandSelectors.ts'
import { useAppDispatch } from '../hooks/hooks'
import { Textarea } from "./ui/textarea"
import { Button } from './ui/button'
import RouteContainer from "@/components/ui/route-container.tsx"
import * as React from "react"

export function SendCommand() {
    const dispatch = useAppDispatch()
    const [text, setText] = useState("")
    const response = useSelector(selectResponse())
    const error = useSelector(selectError())

    const onSubmit =() => dispatch(sendPending({ command: text, pending: true }))

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter") {
            e.preventDefault()
            onSubmit()
        } else if (e.key === "Escape") {
            e.preventDefault()
            setText("")
        }
    }

    const textareaRef = useRef<HTMLTextAreaElement>(null)

    return (
        <RouteContainer title="Send Command">
            <pre className="flex-1 overflow-auto w-full rounded-md bg-muted mx-auto p-4 whitespace-pre-wrap break-words overflow-x-auto">
                <code className={`text-sm font-mono ${error ? "text-destructive" : "text-muted-foreground"}`}>
                    {JSON.stringify(error ?? response, null, 4)}
                </code>
            </pre>
            <div className="flex flex-row gap-4">
                <Textarea
                    className="resize-none whitespace-pre-wrap break-words"
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={onKeyDown}
                    onFocus={() => { textareaRef.current?.select() }}
                    placeholder="Type your Valkey command here"
                    ref={textareaRef}
                    value={text}
                />
                <Button
                    onClick={onSubmit}
                    className="h-full"
                >
                    Send
                </Button>
            </div>
                {/*<div className="w-full h-full">*/}
                {/*    <div className="flex flex-col items-center gap-4">*/}
                {/*        <Textarea*/}
                {/*            placeholder="Type your Valkey command here"*/}
                {/*            value={text}*/}
                {/*            onChange={(e) => setText(e.target.value)}*/}
                {/*            className="w-[600px] h-24 resize-none whitespace-pre-wrap break-words"*/}
                {/*        />*/}
                {/*        <Button*/}
                {/*            onClick={() => dispatch(sendPending({ command: text, pending: true }))}*/}
                {/*            className="h-12 w-32"*/}
                {/*        >*/}
                {/*            Send*/}
                {/*        </Button>*/}
                {/*    </div>*/}

                {/*    {response && (*/}
                {/*        <pre className="rounded-md bg-muted p-4 overflow-x-auto text-left max-w-[600px] mx-auto">*/}
                {/*            <code className="text-sm font-mono text-muted-foreground">*/}
                {/*                {JSON.stringify(response, null, 4)}*/}
                {/*            </code>*/}
                {/*        </pre>*/}
                {/*    )}*/}
                {/*    {error && (*/}
                {/*        <pre className="rounded-md bg-red-100 border border-red-400 text-red-800 p-4 overflow-x-auto text-left max-w-[600px] mx-auto">*/}
                {/*            <code className="text-sm font-mono whitespace-pre-wrap break-words">*/}
                {/*                {error['message']}*/}
                {/*            </code>*/}
                {/*        </pre>*/}
                {/*    )}*/}
                {/*</div>*/}
        </RouteContainer>
)
}

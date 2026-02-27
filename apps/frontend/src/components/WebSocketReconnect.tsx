import { useEffect } from "react"
import { useDispatch, useSelector } from "react-redux"
import { useNavigate } from "react-router"
import { CONNECTED, CONNECTING, ERROR } from "@common/src/constants"
import { Loader2, WifiOff, AlertCircle, ServerOff } from "lucide-react"
import RetryProgress from "./ui/retry-progress"
import type { RootState } from "@/store"
import { connectPending } from "@/state/wsconnection/wsConnectionSlice"

export function WebSocketReconnect() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const wsConnection = useSelector((state: RootState) => state.websocket)
  const { status, reconnect, errorMessage } = wsConnection

  useEffect(() => {
    // redirect to previous location on successful connection
    if (status === CONNECTED) {
      const redirectTo = sessionStorage.getItem("previousLocation") || "/connect"
      sessionStorage.removeItem("previousLocation")
      navigate(redirectTo, { replace: true })
    }
  }, [status, navigate])

  const handleManualReconnect = () => {
    dispatch(connectPending())
  }

  const getNextRetrySeconds = () => {
    if (!reconnect.nextRetryDelay) return 0
    return Math.ceil(reconnect.nextRetryDelay / 1000)
  }

  const isExhausted = status === ERROR && !reconnect.isRetrying

  return (
    <div className="flex items-center justify-center min-h-screen dark:from-gray-900 dark:to-gray-800">
      <div className="w-full max-w-md p-8 space-y-6 bg-white dark:bg-gray-800 rounded-lg shadow-xl">
        <div className="flex justify-center">
          {status === CONNECTING && reconnect.isRetrying ? (
            <div className="relative">
              <Loader2 className="w-16 h-16 text-primary animate-spin" />
            </div>
          ) : isExhausted ? (
            <ServerOff className="w-12 h-12 text-red-500" />
          ) : (
            <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-full">
              <WifiOff className="w-12 h-12 text-gray-500" />
            </div>
          )}
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {isExhausted
              ? "WebSocket Server Disconnected"
              : "Reconnecting to Server..."}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {isExhausted
              ? "Unable to connect to the WebSocket server"
              : "Attempting to restore connection to the WebSocket server"}
          </p>
          {errorMessage && (
            <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-md">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700 dark:text-red-400 text-left">
                  {errorMessage}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Retry Progress */}
        {reconnect.isRetrying && (
          <div className="space-y-3">
            <RetryProgress key={reconnect.nextRetryDelay} nextRetryDelay={reconnect.nextRetryDelay!}/>

            {/* Retry Information */}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">
                Attempt {reconnect.currentAttempt} of {reconnect.maxRetries}
              </span>
              {reconnect.nextRetryDelay && (
                <span className="text-gray-600 dark:text-gray-400">
                  Next retry in {getNextRetrySeconds()}s
                </span>
              )}
            </div>
          </div>
        )}

        {isExhausted && (
          <div className="space-y-2 pt-4">
            <button
              className="w-full border p-2 rounded bg-primary text-white hover:bg-primary/80 cursor-pointer transition-colors"
              onClick={handleManualReconnect}
            >
              Try Reconnecting
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

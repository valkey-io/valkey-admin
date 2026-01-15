import { useEffect } from "react"
import { useDispatch, useSelector } from "react-redux"
import { useNavigate, useParams } from "react-router"
import { CONNECTED, CONNECTING, ERROR } from "@common/src/constants"
import { Loader2, Database, AlertCircle } from "lucide-react"
import RetryProgress from "./ui/retry-progress"
import type { RootState } from "@/store"
import { connectPending } from "@/state/valkey-features/connection/connectionSlice"

export function ValkeyReconnect() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { id, clusterId } = useParams()

  const connection = useSelector((state: RootState) =>
    state.valkeyConnection?.connections?.[id!],
  )

  const { status, errorMessage, reconnect } = connection || {}

  useEffect(() => {
    // Redirect to dashboard or previous location on successful connection
    if (status === CONNECTED) {
      const redirectTo = clusterId ? (`${clusterId}/${id}/dashboard`) : sessionStorage.getItem(`valkey-previous-${id}`) || (`/${id}/dashboard`)
      sessionStorage.removeItem(`valkey-previous-${id}`)
      navigate(redirectTo, { replace: true })
    }
  }, [status, navigate, id, clusterId])

  const handleManualReconnect = () => {
    if (!connection) return
    
    dispatch(connectPending({
      connectionId: id!,
      connectionDetails: connection.connectionDetails,
    }))
  }

  const getNextRetrySeconds = () => {
    if (!reconnect?.nextRetryDelay) return 0
    return Math.ceil(reconnect.nextRetryDelay / 1000)
  }

  const isExhausted = status === ERROR && (!reconnect || !reconnect.isRetrying)

  return (
    <div className="flex items-center justify-center min-h-screen dark:from-gray-900 dark:to-gray-800">
      <div className="w-full max-w-md p-8 space-y-6 bg-white dark:bg-gray-800 rounded-lg shadow-xl">
        <div className="flex justify-center">
          {status === CONNECTING && reconnect?.isRetrying ? (
            <div className="relative p-2 bg-gray-100 dark:bg-gray-700 rounded-full">
              <Loader2 className="w-16 h-16 text-tw-primary animate-spin" />
            </div>
          ) : isExhausted ? (
            <Database className="w-16 h-16 text-red-500" />
          ) : (
            <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-full">
              <Database className="w-16 h-16 text-gray-500" />
            </div>
          )}
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {isExhausted
              ? "Valkey Connection Lost"
              : "Reconnecting to Valkey..."}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {connection.connectionDetails.host}:{connection.connectionDetails.port}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {isExhausted
              ? "Unable to connect to the Valkey instance"
              : "Attempting to restore connection to Valkey"}
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
        {reconnect?.isRetrying && (
          <div className="space-y-3">
            <RetryProgress key={reconnect.nextRetryDelay} nextRetryDelay={reconnect.nextRetryDelay!} />

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
              className="w-full border p-2 rounded bg-tw-primary text-white hover:bg-tw-primary/80 cursor-pointer transition-colors"
              onClick={handleManualReconnect}
            >
              Try Reconnecting to Valkey
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

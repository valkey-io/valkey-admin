interface retryProgressProps {
  nextRetryDelay : number 
}

export default function RetryProgress({ nextRetryDelay }: retryProgressProps) {
  return (
    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
      <div
        className="bg-primary h-full animate-linear-progress"
        key={nextRetryDelay}
        style={{
          animationDuration: `${nextRetryDelay}ms`,
        }}
      />
    </div>
  )
}

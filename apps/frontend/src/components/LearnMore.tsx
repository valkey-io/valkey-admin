import { CircleQuestionMark } from "lucide-react"

export default function LearnMore() {
  return (
    <div className="p-4 relative min-h-screen flex flex-col">
      {/* top header */}
      <div className="flex items-center justify-between h-10">
        <h1 className="text-xl font-bold flex items-center gap-2 text-gray-700 dark:text-white">
          <CircleQuestionMark /> Learn More
        </h1>
      </div>
      <div className="flex flex-col flex-1 items-center justify-center gap-2 font-light text-sm">
        <span className="text-tw-primary underline">Valkey Admin Version 0.0.1</span>
        <p className="text-gray-600 dark:text-white">A dedicated UI for Valkey</p>
      </div>
    </div>
  )
}

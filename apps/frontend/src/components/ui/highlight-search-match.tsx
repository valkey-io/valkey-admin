interface HighlightMatchProps {
  text: string
  query: string
}

export function HighlightSearchMatch({ text, query }: HighlightMatchProps) {
  if (!query) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <span className="bg-primary/30 dark:bg-primary/50 rounded">
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
  )
}

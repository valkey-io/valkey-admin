interface HighlightMatchProps {
  text: string;
  query: string;
}

export function HighlightSearchMatch({ text, query }: HighlightMatchProps) {
  if (!query) return <span>{text}</span>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <span>{text}</span>
  return (
    <span>
      {text.slice(0, idx)}
      <span className="bg-primary text-white">
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </span>
  )
}

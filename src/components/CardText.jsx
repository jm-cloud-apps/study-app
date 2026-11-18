// Flashcards are read at a glance, so their text is deliberately NOT full
// Markdown — a card answer is prose that happens to contain command names, and
// running it through a Markdown parser would reinterpret things authors never
// meant as markup (`origin/*` as italics, `1)` as a list, `<<<<<<<` as HTML).
//
// Instead we support exactly the two marks the content already uses:
//
//   `code`      -> inline code, the way a command or filename should look
//   **bold**    -> emphasis on the one phrase the card is really about
//
// Everything else — including newlines, which the caller renders with
// `whitespace-pre-line` — is left exactly as written. Text is rendered as React
// children (never dangerouslySetInnerHTML), so content can't inject markup.

// Split on inline code first: nothing inside a code span is re-interpreted.
const CODE = /(`[^`]+`)/g
// Bold only when the marks actually wrap something, so a stray ** is left alone.
const BOLD = /(\*\*(?=\S)[\s\S]*?(?<=\S)\*\*)/g

export default function CardText({ text }) {
  if (typeof text !== 'string' || !text) return null

  const parts = []
  text.split(CODE).forEach((chunk, i) => {
    if (!chunk) return

    if (chunk.startsWith('`') && chunk.endsWith('`') && chunk.length > 2) {
      parts.push(
        <code
          key={`c${i}`}
          className="rounded bg-fill/10 px-1 py-0.5 font-mono text-[0.9em] text-brand-soft"
        >
          {chunk.slice(1, -1)}
        </code>,
      )
      return
    }

    chunk.split(BOLD).forEach((piece, j) => {
      if (!piece) return
      if (piece.startsWith('**') && piece.endsWith('**') && piece.length > 4) {
        parts.push(
          <strong key={`b${i}-${j}`} className="font-semibold text-strong">
            {piece.slice(2, -2)}
          </strong>,
        )
      } else {
        parts.push(<span key={`t${i}-${j}`}>{piece}</span>)
      }
    })
  })

  return <>{parts}</>
}

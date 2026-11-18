import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { INDEX, parseTerms, search, snippetFor } from '../lib/search.js'

const KIND_LABEL = {
  topic: { icon: '📚', label: 'Topic' },
  lesson: { icon: '📄', label: 'Lesson' },
  card: { icon: '🃏', label: 'Card' },
  interview: { icon: '🎤', label: 'Question' },
}

// Highlight the matched terms so the eye lands on the reason a row is here.
function Highlight({ text, terms }) {
  if (!terms.length) return text
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const parts = text.split(new RegExp(`(${escaped})`, 'ig'))
  return parts.map((part, i) =>
    terms.includes(part.toLowerCase()) ? (
      <mark key={i} className="rounded bg-accent/25 px-0.5 text-inherit">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  )
}

export default function SearchPalette({ open, onClose }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const terms = useMemo(() => parseTerms(query), [query])
  const results = useMemo(() => search(query), [query])

  // Reset every time it opens, so it never reopens onto a stale search.
  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      // Focus after paint, or the browser has nothing to focus yet.
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => setActive(0), [query])

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const go = (entry) => {
    if (!entry) return
    onClose()
    navigate(entry.to)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(results.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(results[active])
    }
  }

  return (
    <div
      className="scrim fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh] backdrop-blur-sm"
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search StudyForge"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        className="flex max-h-[75vh] w-full max-w-2xl animate-rise flex-col overflow-hidden rounded-2xl border border-line/15 bg-surface shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-line/10 px-4 py-3">
          <span aria-hidden="true" className="text-muted">
            🔎
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search lessons, cards and questions…"
            aria-label="Search"
            className="w-full bg-transparent text-body outline-none placeholder:text-faint"
          />
          <button
            onClick={onClose}
            className="rounded border border-line/15 px-1.5 py-0.5 font-mono text-[10px] text-faint hover:text-body"
          >
            esc
          </button>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
          {query.trim() === '' ? (
            <p className="px-4 py-8 text-center text-sm text-muted">
              Searching {INDEX.length.toLocaleString()} lessons, cards and questions. Type a word you
              half-remember — the lesson text is searched too, not just titles.
            </p>
          ) : results.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">
              Nothing matched “{query}”. Try a single keyword — that usually finds it.
            </p>
          ) : (
            <ul className="p-2">
              {results.map((entry, i) => {
                const kind = KIND_LABEL[entry.kind]
                return (
                  <li key={entry.id}>
                    <button
                      data-active={i === active}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(entry)}
                      className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                        i === active ? 'bg-fill/10' : 'hover:bg-fill/5'
                      }`}
                    >
                      <span aria-hidden="true" className="mt-0.5 text-base">
                        {kind.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-medium text-strong">
                            <Highlight text={entry.title} terms={terms} />
                          </span>
                          <span className="text-[11px] text-faint">{entry.subtitle}</span>
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-muted">
                          <Highlight text={snippetFor(entry, terms)} terms={terms} />
                        </span>
                      </span>
                      <span className="mt-0.5 shrink-0 rounded-full bg-fill/5 px-2 py-0.5 text-[10px] text-faint">
                        {kind.label}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-line/10 px-4 py-2 text-[11px] text-faint">
          <span>↑ ↓ to move</span>
          <span>↵ to open</span>
          <span className="ml-auto">
            {results.length > 0 && `${results.length} result${results.length === 1 ? '' : 's'}`}
          </span>
        </div>
      </div>
    </div>
  )
}

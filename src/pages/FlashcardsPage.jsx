import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getTopic, ALL_FLASHCARDS } from '../content/loadContent.js'
import { orderForSession, gradeCard, getCardStats } from '../lib/progress.js'
import { encouragement } from '../lib/encouragement.js'
import CardText from '../components/CardText.jsx'
import { topTags, filterByTags } from '../lib/tags.js'

// Grading keys sit under the resting fingers, in the same left-to-right order
// as the buttons, so the shortcut and the UI teach each other.
const GRADE_KEYS = { 1: 'again', 2: 'good', 3: 'easy' }

// Session sizes. `null` means "however many there are".
const SIZES = [10, 25, 50, null]
const DEFAULT_LIMIT = 25

export default function FlashcardsPage() {
  const { topicId } = useParams()
  const topic = topicId ? getTopic(topicId) : null
  const deck = topicId ? topic?.flashcards || [] : ALL_FLASHCARDS
  const title = topic ? topic.title : 'Everything'

  // Session config chosen on the setup screen.
  const [session, setSession] = useState(null) // { cards, index, results, flipped }
  // "Study all" across every topic is 900-odd cards — a number nobody finishes,
  // and an unfinishable session is one you don't start. A cap turns it into
  // something you can actually sit down and complete.
  const [limit, setLimit] = useState(DEFAULT_LIMIT)
  // Focus tags narrow the deck to one slice of a topic (e.g. only the CKS
  // cards). Empty means the whole deck. Reset when you move to another topic,
  // whose tags are different words.
  const [focus, setFocus] = useState([])
  useEffect(() => setFocus([]), [topicId])
  const activeDeck = useMemo(() => filterByTags(deck, focus), [deck, focus])
  const gradeRef = useRef(() => {})

  const startSession = useCallback(
    (onlyDue) => {
      const ordered = orderForSession(activeDeck, { onlyDue, shuffle: true })
      const cards = limit ? ordered.slice(0, limit) : ordered
      if (cards.length === 0) return
      setSession({ cards, index: 0, flipped: false, results: { again: 0, good: 0, easy: 0 }, lastMsg: '' })
    },
    [activeDeck, limit],
  )

  // Free navigation between cards (does not grade — just moves the cursor).
  const goNext = useCallback(() => {
    setSession((s) => (s && s.index < s.cards.length ? { ...s, index: s.index + 1, flipped: false, lastMsg: '' } : s))
  }, [])
  const goPrev = useCallback(() => {
    setSession((s) => (s && s.index > 0 ? { ...s, index: s.index - 1, flipped: false, lastMsg: '' } : s))
  }, [])
  const toggleFlip = useCallback(() => {
    setSession((s) => (s ? { ...s, flipped: !s.flipped } : s))
  }, [])

  // Keyboard shortcuts during an active session: ← previous, → next, Space/Enter
  // flip, and 1/2/3 to grade once the answer is showing. Grading was the one
  // action that still required the mouse, and it's the only one that changes
  // when a card comes back.
  useEffect(() => {
    const onKey = (e) => {
      if (!session || session.index >= session.cards.length) return
      if (/^(input|textarea|select)$/i.test(e.target?.tagName || '')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === 'ArrowRight') {
        e.preventDefault()
        goNext()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrev()
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        toggleFlip()
      } else if (session.flipped && GRADE_KEYS[e.key]) {
        e.preventDefault()
        gradeRef.current(GRADE_KEYS[e.key])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [session, goNext, goPrev, toggleFlip])

  if (deck.length === 0) {
    return (
      <Empty>
        No flashcards here yet.{' '}
        <Link to="/" className="text-brand-soft underline">
          Browse topics
        </Link>
      </Empty>
    )
  }

  if (!session) {
    return (
      <SetupScreen
        title={title}
        deck={deck}
        activeDeck={activeDeck}
        focus={focus}
        onFocusChange={setFocus}
        topicId={topicId}
        onStart={startSession}
        limit={limit}
        onLimitChange={setLimit}
      />
    )
  }

  if (session.index >= session.cards.length) {
    return (
      <SummaryScreen
        title={focus.length ? `${title} (${focus.join(', ')})` : title}
        session={session}
        onRestart={() => startSession(false)}
        topicId={topicId}
      />
    )
  }

  const card = session.cards[session.index]

  const handleGrade = (grade) => {
    gradeCard(card.id, grade)
    setSession((s) => ({
      ...s,
      index: s.index + 1,
      flipped: false,
      results: { ...s.results, [grade]: s.results[grade] + 1 },
      lastMsg: encouragement.afterGrade(grade),
    }))
  }
  // The key handler is registered above the early returns (hooks can't be
  // conditional), so it reaches the grader through a ref rather than closing
  // over a value that doesn't exist yet.
  gradeRef.current = handleGrade

  const progress = Math.round((session.index / session.cards.length) * 100)

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between text-sm text-muted">
        <Link to={topicId ? `/topic/${topicId}` : '/'} className="hover:text-body">
          ← Exit session
        </Link>
        <span>
          Card {session.index + 1} of {session.cards.length}
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-fill/10">
        <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${progress}%` }} />
      </div>

      {session.lastMsg && <p className="text-center text-sm text-brand-soft">{session.lastMsg}</p>}

      <div className="flex items-center gap-2 sm:gap-3">
        <NavArrow
          dir="prev"
          onClick={goPrev}
          disabled={session.index === 0}
          title="Previous card (←)"
        />
        <div className="flex-1">
          <Flashcard key={card.id} card={card} flipped={session.flipped} onFlip={toggleFlip} />
        </div>
        <NavArrow dir="next" onClick={goNext} title="Next card (→)" />
      </div>

      <p className="text-center text-xs text-faint">
        <Kbd>←</Kbd> <Kbd>→</Kbd> to move · <Kbd>Space</Kbd> to flip
        {session.flipped && (
          <>
            {' '}
            · <Kbd>1</Kbd> <Kbd>2</Kbd> <Kbd>3</Kbd> to grade
          </>
        )}
      </p>

      {session.flipped ? (
        <div>
          <p className="mb-2 text-center text-sm text-muted">How well did you know it? Be honest — it tunes when this card returns.</p>
          <div className="grid grid-cols-3 gap-3">
            <GradeButton onClick={() => handleGrade('again')} shortcut="1" className="bg-danger/15 text-danger hover:bg-danger/25">
              Again
              <span className="block text-[11px] font-normal opacity-70">show soon</span>
            </GradeButton>
            <GradeButton onClick={() => handleGrade('good')} shortcut="2" className="bg-brand/15 text-brand-soft hover:bg-brand/25">
              Good
              <span className="block text-[11px] font-normal opacity-70">got it</span>
            </GradeButton>
            <GradeButton onClick={() => handleGrade('easy')} shortcut="3" className="bg-success/15 text-success hover:bg-success/25">
              Easy
              <span className="block text-[11px] font-normal opacity-70">too simple</span>
            </GradeButton>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setSession((s) => ({ ...s, flipped: true }))}
          className="w-full rounded-xl bg-fill/5 py-3 font-medium text-body hover:bg-fill/10"
        >
          Reveal answer
        </button>
      )}
    </div>
  )
}

function Flashcard({ card, flipped, onFlip }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={flipped ? 'Answer. Activate to show the question.' : 'Question. Activate to reveal the answer.'}
      onKeyDown={(e) => {
        // Space/Enter are handled globally, but a focusable control has to
        // respond to them itself or keyboard users get a dead element.
        if (e.key === ' ' || e.key === 'Enter') e.preventDefault()
      }}
      className="card-3d h-72 w-full cursor-pointer select-none rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-brand"
      onClick={onFlip}
    >
      <div className={`card-inner relative h-full w-full ${flipped ? 'is-flipped' : ''}`}>
        {/* Front — question */}
        <div className="card-face absolute inset-0 flex flex-col overflow-auto rounded-2xl border border-line/10 bg-surface p-6">
          <span className="text-xs font-semibold uppercase tracking-wide text-faint">Question</span>
          <div className="flex flex-1 items-center justify-center text-center">
            <p className="text-lg font-medium text-strong">
              <CardText text={card.q} />
            </p>
          </div>
          {card.hint && (
            <p className="text-center text-xs text-faint">
              💡 Hint: <CardText text={card.hint} />
            </p>
          )}
          <p className="text-center text-xs text-faint">tap to flip</p>
        </div>
        {/* Back — answer */}
        <div className="card-face card-back absolute inset-0 flex flex-col overflow-auto rounded-2xl border border-brand/30 bg-gradient-to-br from-surface to-sunken p-6">
          <span className="text-xs font-semibold uppercase tracking-wide text-brand-soft">Answer</span>
          <div className="flex flex-1 items-center justify-center text-center">
            <p className="whitespace-pre-line text-base text-strong">
              <CardText text={card.a} />
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function NavArrow({ dir, onClick, disabled, title }) {
  const isPrev = dir === 'prev'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={isPrev ? 'Previous card' : 'Next card'}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line/10 bg-fill/5 text-xl text-body transition hover:bg-fill/10 hover:text-strong disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:bg-fill/5"
    >
      {isPrev ? '‹' : '›'}
    </button>
  )
}

function Kbd({ children }) {
  return (
    <kbd className="rounded border border-line/15 bg-fill/5 px-1.5 py-0.5 font-mono text-[10px] text-muted">
      {children}
    </kbd>
  )
}

function GradeButton({ children, className, onClick, shortcut }) {
  return (
    <button
      onClick={onClick}
      title={shortcut ? `Press ${shortcut}` : undefined}
      className={`relative rounded-xl py-3 text-center font-semibold transition ${className}`}
    >
      {shortcut && (
        <span aria-hidden="true" className="absolute left-2 top-1.5 font-mono text-[10px] opacity-50">
          {shortcut}
        </span>
      )}
      {children}
    </button>
  )
}

function SizePicker({ value, onChange, max }) {
  return (
    <div className="mt-6">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">Session length</div>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {SIZES.map((size) => {
          // Don't offer a cap bigger than the deck — "50" beside a 22-card
          // topic promises cards that aren't there.
          if (size !== null && size >= max) return null
          // A cap at or above the deck (e.g. 50 after Focus narrowed it to 36)
          // deals the whole deck, so "All" is what's really selected.
          const active = value === size || (size === null && value !== null && value >= max)
          return (
            <button
              key={String(size)}
              onClick={() => onChange(size)}
              aria-pressed={active}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                active
                  ? 'bg-brand text-ink'
                  : 'border border-line/10 bg-fill/5 text-body hover:bg-fill/10'
              }`}
            >
              {size === null ? `All (${max})` : size}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function FocusPicker({ deck, focus, onChange }) {
  const tags = useMemo(() => topTags(deck), [deck])
  if (tags.length === 0) return null
  const toggle = (tag) =>
    onChange(focus.includes(tag) ? focus.filter((t) => t !== tag) : [...focus, tag])
  const chip = (active) =>
    `rounded-full px-3 py-1 text-sm font-medium transition ${
      active ? 'bg-brand text-ink' : 'border border-line/10 bg-fill/5 text-body hover:bg-fill/10'
    }`
  return (
    <div className="mt-6">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">Focus</div>
      <p className="mt-1 text-xs text-faint">Study one slice of the deck, or pick several. Leave it on All for everything.</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <button onClick={() => onChange([])} aria-pressed={focus.length === 0} className={chip(focus.length === 0)}>
          All
        </button>
        {tags.map(({ tag, count }) => {
          const active = focus.includes(tag)
          return (
            <button key={tag} onClick={() => toggle(tag)} aria-pressed={active} className={chip(active)}>
              {tag} <span className="opacity-60">{count}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SetupScreen({ title, deck, activeDeck, focus, onFocusChange, topicId, onStart, limit, onLimitChange }) {
  const stats = useMemo(() => getCardStats(activeDeck), [activeDeck])
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Link to={topicId ? `/topic/${topicId}` : '/'} className="text-sm text-muted hover:text-body">
        ← Back
      </Link>
      <div className="animate-rise rounded-3xl border border-line/10 bg-surface p-8 text-center">
        <div className="text-5xl">🃏</div>
        <h1 className="mt-3 text-2xl font-bold text-strong">Flashcards · {title}</h1>
        <p className="mt-2 text-muted">
          Cards are shuffled fresh each session and the ones you find hard come back sooner. Take it at
          your own pace — there's no wrong speed.
        </p>
        <div className="mt-6 grid grid-cols-3 gap-3 text-center">
          <Stat label="Total" value={stats.total} />
          <Stat label="Due now" value={stats.due} tone="brand" />
          <Stat label="Mastered" value={stats.mastered} tone="success" />
        </div>
        <FocusPicker deck={deck} focus={focus} onChange={onFocusChange} />
        <SizePicker value={limit} onChange={onLimitChange} max={stats.total} />

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={() => onStart(true)}
            disabled={stats.due === 0}
            className="rounded-xl bg-brand px-5 py-2.5 font-medium text-ink shadow-lg shadow-brand/20 hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-40"
          >
            Review due ({capped(stats.due, limit)})
          </button>
          <button
            onClick={() => onStart(false)}
            className="rounded-xl bg-fill/5 px-5 py-2.5 font-medium text-body hover:bg-fill/10"
          >
            Study any ({capped(stats.total, limit)})
          </button>
        </div>
        {stats.due === 0 && (
          <p className="mt-4 text-sm text-success">
            🎉 Nothing due right now — you're all caught up. Reviewing all is still great practice.
          </p>
        )}
      </div>
    </div>
  )
}

function SummaryScreen({ title, session, onRestart, topicId }) {
  const { again, good, easy } = session.results
  const total = again + good + easy
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="animate-rise rounded-3xl border border-line/10 bg-surface p-8 text-center">
        <div className="text-5xl">✨</div>
        <h1 className="mt-3 text-2xl font-bold text-strong">Session complete</h1>
        <p className="mt-2 text-body">{encouragement.sessionDone()}</p>
        <p className="mt-1 text-sm text-faint">
          You reviewed {total} card{total === 1 ? '' : 's'} from {title}.
        </p>
        <div className="mt-6 grid grid-cols-3 gap-3">
          <Stat label="Again" value={again} tone="danger" />
          <Stat label="Good" value={good} tone="brand" />
          <Stat label="Easy" value={easy} tone="success" />
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={onRestart}
            className="rounded-xl bg-brand px-5 py-2.5 font-medium text-ink hover:bg-brand-soft"
          >
            Study again
          </button>
          <Link
            to={topicId ? `/topic/${topicId}` : '/'}
            className="rounded-xl bg-fill/5 px-5 py-2.5 font-medium text-body hover:bg-fill/10"
          >
            Done for now
          </Link>
        </div>
      </div>
    </div>
  )
}

// Tones are classes, not hex, so the number follows the theme like everything
// else — an inline colour is the one thing a CSS-variable palette can't reach.
const STAT_TONE = {
  brand: 'text-brand',
  success: 'text-success',
  danger: 'text-danger',
  neutral: 'text-strong',
}

function Stat({ label, value, tone = 'neutral' }) {
  return (
    <div className="rounded-xl bg-fill/5 p-3">
      <div className={`text-2xl font-bold ${STAT_TONE[tone] || STAT_TONE.neutral}`}>{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  )
}

// What a button will actually deal you, once the session cap is applied.
function capped(n, limit) {
  return limit ? Math.min(n, limit) : n
}

function Empty({ children }) {
  return (
    <div className="rounded-2xl border border-dashed border-line/15 p-10 text-center text-muted">{children}</div>
  )
}

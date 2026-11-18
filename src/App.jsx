import { useCallback, useEffect, useReducer, useState } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import Home from './pages/Home.jsx'
import TopicPage from './pages/TopicPage.jsx'
import LessonPage from './pages/LessonPage.jsx'
import FlashcardsPage from './pages/FlashcardsPage.jsx'
import InterviewPage from './pages/InterviewPage.jsx'
import SearchPalette from './components/SearchPalette.jsx'
import ThemeToggle from './components/ThemeToggle.jsx'
import { getStreak, hydrate, resetAllProgress, subscribeProgress } from './lib/progress.js'
import { lockApp } from './auth/PasswordGate.jsx'

const NAV = [
  { to: '/', label: 'Topics', match: (p) => p === '/' },
  { to: '/flashcards', label: 'Flashcards', match: (p) => p.startsWith('/flashcards') },
  { to: '/interview', label: 'Interview', match: (p) => p.startsWith('/interview') },
]

function Header({ onOpenSearch }) {
  const streak = getStreak()
  const { pathname } = useLocation()
  return (
    <header className="sticky top-0 z-20 border-b border-line/10 bg-ink/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link to="/" className="flex items-center gap-2.5 group">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand to-brand-deep text-lg shadow-lg shadow-brand/20">
            🎓
          </span>
          <div className="leading-tight">
            <div className="font-bold text-strong group-hover:text-brand-soft transition">StudyForge</div>
            <div className="text-[11px] text-muted">Learn anything, one card at a time</div>
          </div>
        </Link>

        <nav className="ml-auto flex items-center gap-1 text-sm">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`rounded-lg px-2.5 py-1.5 transition hover:bg-fill/5 sm:px-3 ${
                item.match(pathname) ? 'text-strong' : 'text-muted'
              }`}
            >
              {item.label}
            </Link>
          ))}

          <button
            onClick={onOpenSearch}
            title="Search everything (⌘K)"
            aria-label="Search"
            className="ml-1 flex items-center gap-2 rounded-lg border border-line/10 bg-fill/5 px-2.5 py-1.5 text-muted transition hover:bg-fill/10 hover:text-body"
          >
            <span aria-hidden="true">🔎</span>
            <kbd className="hidden font-mono text-[10px] sm:inline">⌘K</kbd>
          </button>

          {streak > 0 && (
            <span
              title={`${streak}-day study streak`}
              className="ml-1 flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent"
            >
              🔥 {streak}
            </span>
          )}

          <div className="ml-1">
            <ThemeToggle />
          </div>
        </nav>
      </div>
    </header>
  )
}

export default function App() {
  // Re-render the whole tree whenever progress changes (incl. async hydrate),
  // since pages read the synchronous progress cache during render.
  const [, forceRender] = useReducer((n) => n + 1, 0)
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    const unsub = subscribeProgress(forceRender)
    hydrate() // pull durable state from the SQLite-backed API on startup
    return unsub
  }, [])

  // ⌘K / Ctrl-K anywhere, and "/" when you aren't already typing into a field.
  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(input|textarea|select)$/i.test(e.target?.tagName || '')
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      } else if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const closeSearch = useCallback(() => setSearchOpen(false), [])

  return (
    <div className="min-h-full">
      <Header onOpenSearch={() => setSearchOpen(true)} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Routes>
          <Route path="/" element={<Home onOpenSearch={() => setSearchOpen(true)} />} />
          <Route path="/topic/:topicId" element={<TopicPage />} />
          <Route path="/topic/:topicId/lesson/:slug" element={<LessonPage />} />
          <Route path="/flashcards" element={<FlashcardsPage />} />
          <Route path="/flashcards/:topicId" element={<FlashcardsPage />} />
          <Route path="/interview" element={<InterviewPage />} />
          <Route path="/interview/:topicId" element={<InterviewPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
      <SearchPalette open={searchOpen} onClose={closeSearch} />
    </div>
  )
}

function Footer() {
  // Two-step, because wiping a study history is not undoable and a stray click
  // shouldn't be able to do it. Until now there was no way to reset at all.
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!confirming) return
    const t = setTimeout(() => setConfirming(false), 6000)
    return () => clearTimeout(t)
  }, [confirming])

  return (
    <footer className="mx-auto max-w-5xl px-4 py-10 text-center text-xs text-faint">
      StudyForge · your progress stays private in this browser ·{' '}
      <Link to="/" className="hover:text-body">
        home
      </Link>{' '}
      ·{' '}
      <button onClick={lockApp} className="hover:text-body">
        lock
      </button>{' '}
      ·{' '}
      {confirming ? (
        <span className="text-danger">
          Erase every lesson, card and streak?{' '}
          <button
            onClick={() => {
              resetAllProgress()
              setConfirming(false)
            }}
            className="font-semibold underline"
          >
            yes, reset
          </button>{' '}
          <button onClick={() => setConfirming(false)} className="underline">
            cancel
          </button>
        </span>
      ) : (
        <button onClick={() => setConfirming(true)} className="hover:text-body">
          reset progress
        </button>
      )}
    </footer>
  )
}

function NotFound() {
  return (
    <div className="rounded-2xl border border-line/10 bg-surface p-10 text-center">
      <p className="text-2xl">🧭</p>
      <h1 className="mt-2 text-xl font-semibold text-strong">This page wandered off</h1>
      <p className="mt-1 text-muted">No problem — let's get you back on track.</p>
      <Link
        to="/"
        className="mt-5 inline-block rounded-lg bg-brand px-4 py-2 font-medium text-ink hover:bg-brand-soft"
      >
        Back to topics
      </Link>
    </div>
  )
}

import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { getLesson } from '../content/loadContent.js'
import { isLessonRead, markLessonRead, markLessonUnread } from '../lib/progress.js'
import { rememberLesson } from '../lib/recent.js'

export default function LessonPage() {
  const { topicId, slug } = useParams()
  const data = getLesson(topicId, slug)
  const navigate = useNavigate()

  // Scroll to top whenever we move between lessons, and remember this one
  // for the home page's "pick up where you left off".
  useEffect(() => {
    window.scrollTo({ top: 0 })
    if (data) rememberLesson(topicId, slug)
  }, [topicId, slug, data])

  // ← / → step between lessons. Ignored while typing, with modifiers held
  // (browser back/forward shortcuts), or while a dialog such as search is open.
  const prevSlug = data?.prev?.slug
  const nextSlug = data?.next?.slug
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.defaultPrevented) return
      if (/^(input|textarea|select)$/i.test(e.target?.tagName || '') || e.target?.isContentEditable) return
      if (document.querySelector('[role="dialog"]')) return
      const to = e.key === 'ArrowLeft' ? prevSlug : e.key === 'ArrowRight' ? nextSlug : null
      if (!to) return
      e.preventDefault()
      navigate(`/topic/${topicId}/lesson/${to}`)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, topicId, prevSlug, nextSlug])

  if (!data) {
    return (
      <div className="rounded-2xl border border-line/10 bg-surface p-8 text-center text-muted">
        Lesson not found.{' '}
        <Link to="/" className="text-brand-soft underline">
          Back to topics
        </Link>
      </div>
    )
  }

  const { topic, lesson, prev, next } = data
  const read = isLessonRead(topic.id, lesson.slug)
  const position = topic.lessons.findIndex((l) => l.slug === lesson.slug) + 1

  return (
    <article className="space-y-8">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Link to="/" className="hover:text-body">
          Topics
        </Link>
        <span>/</span>
        <Link to={`/topic/${topic.id}`} className="hover:text-body">
          {topic.title}
        </Link>
        <span className="ml-auto text-xs text-faint">
          Lesson {position} of {topic.lessons.length} · {lesson.minutes} min
          <span className="hidden sm:inline"> · ← → to move</span>
        </span>
      </div>

      <div className="lesson-prose animate-rise max-w-none">
        <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
          {lesson.markdown}
        </Markdown>
      </div>

      {/* The button used to fire and change nothing on screen, so there was no
          way to tell a click had registered — or to take one back. */}
      <div
        className={`rounded-2xl border p-5 text-center transition ${
          read ? 'border-success/30 bg-success/10' : 'border-line/10 bg-surface'
        }`}
      >
        {read ? (
          <>
            <p className="font-medium text-success">✓ Marked as read — nice work.</p>
            <button
              onClick={() => markLessonUnread(topic.id, lesson.slug)}
              className="mt-2 text-sm text-muted underline underline-offset-2 hover:text-body"
            >
              Not quite yet — undo
            </button>
          </>
        ) : (
          <>
            <p className="text-body">Finished reading? Mark it done to track your progress.</p>
            <button
              onClick={() => markLessonRead(topic.id, lesson.slug)}
              className="mt-3 rounded-xl bg-success/20 px-5 py-2 font-medium text-success hover:bg-success/30"
            >
              ✓ I've read this
            </button>
          </>
        )}
      </div>

      <nav className="flex items-stretch justify-between gap-3">
        {prev ? (
          <Link
            to={`/topic/${topic.id}/lesson/${prev.slug}`}
            className="flex-1 rounded-xl border border-line/10 bg-surface p-4 transition hover:border-line/20"
          >
            <div className="text-xs text-faint">← Previous</div>
            <div className="mt-0.5 font-medium text-strong">{prev.title}</div>
          </Link>
        ) : (
          <span className="flex-1" />
        )}
        {next ? (
          <Link
            to={`/topic/${topic.id}/lesson/${next.slug}`}
            className="flex-1 rounded-xl border border-line/10 bg-surface p-4 text-right transition hover:border-line/20"
          >
            <div className="text-xs text-faint">Next →</div>
            <div className="mt-0.5 font-medium text-strong">{next.title}</div>
          </Link>
        ) : (
          <Link
            to={`/flashcards/${topic.id}`}
            className="flex-1 rounded-xl border border-brand/40 bg-brand/10 p-4 text-right transition hover:bg-brand/20"
          >
            <div className="text-xs text-brand-soft">You finished the topic! 🎉</div>
            <div className="mt-0.5 font-medium text-strong">Lock it in with flashcards →</div>
          </Link>
        )}
      </nav>
    </article>
  )
}

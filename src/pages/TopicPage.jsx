import { Link, useParams } from 'react-router-dom'
import { getTopic } from '../content/loadContent.js'
import { isLessonRead, getCardStats } from '../lib/progress.js'

export default function TopicPage() {
  const { topicId } = useParams()
  const topic = getTopic(topicId)

  if (!topic) {
    return (
      <div className="rounded-2xl border border-line/10 bg-surface p-8 text-center text-muted">
        That topic doesn't exist (yet).{' '}
        <Link to="/" className="text-brand-soft underline">
          Back to topics
        </Link>
      </div>
    )
  }

  const cards = getCardStats(topic.flashcards)

  return (
    <div className="space-y-6">
      <Link to="/" className="text-sm text-muted hover:text-body">
        ← All topics
      </Link>

      <header className="flex flex-wrap items-start gap-4 rounded-2xl border border-line/10 bg-surface p-6">
        <span
          className="grid h-14 w-14 place-items-center rounded-2xl text-3xl"
          style={{ background: `${topic.accent}22` }}
        >
          {topic.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-strong">{topic.title}</h1>
          <p className="mt-1 text-muted">{topic.blurb}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-center">
          {topic.flashcards.length > 0 && (
            <Link
              to={`/flashcards/${topic.id}`}
              className="rounded-xl bg-brand px-4 py-2 font-medium text-ink hover:bg-brand-soft"
            >
              🃏 {cards.due} due · study
            </Link>
          )}
          {topic.interview.length > 0 && (
            <Link
              to={`/interview/${topic.id}`}
              className="rounded-xl border border-line/10 bg-fill/5 px-4 py-2 font-medium text-body hover:bg-fill/10"
            >
              {topic.interviewEmoji} {topic.interview.length} {topic.interviewNoun}
            </Link>
          )}
        </div>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Lessons ({topic.lessons.length})
        </h2>
        <ol className="space-y-2">
          {topic.lessons.map((lesson, i) => {
            const read = isLessonRead(topic.id, lesson.slug)
            return (
              <li key={lesson.slug}>
                <Link
                  to={`/topic/${topic.id}/lesson/${lesson.slug}`}
                  className="flex items-center gap-4 rounded-xl border border-line/10 bg-surface px-4 py-3 transition hover:border-line/20 hover:bg-surface/70"
                >
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${
                      read ? 'bg-success/20 text-success' : 'bg-fill/5 text-muted'
                    }`}
                  >
                    {read ? '✓' : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-strong">{lesson.title}</span>
                    <span className="text-xs text-faint">{lesson.minutes} min read</span>
                  </span>
                  <span className="text-faint">→</span>
                </Link>
              </li>
            )
          })}
        </ol>
      </section>
    </div>
  )
}

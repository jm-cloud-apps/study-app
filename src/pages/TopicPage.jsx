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

  // Where to pick up: the first lesson not yet marked read. Lessons are meant
  // to be read in order, so "first unread" beats "most recently opened".
  const readCount = topic.lessons.filter((l) => isLessonRead(topic.id, l.slug)).length
  const nextIndex = topic.lessons.findIndex((l) => !isLessonRead(topic.id, l.slug))
  const nextLesson = nextIndex === -1 ? null : topic.lessons[nextIndex]
  const related = topic.related.map(getTopic).filter(Boolean)

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
          {topic.lessons.length > 1 && (
            <Link
              to={`/review/${topic.id}`}
              className="rounded-xl border border-line/10 bg-fill/5 px-4 py-2 font-medium text-body hover:bg-fill/10"
            >
              📝 Review sheet
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

      {topic.lessons.length > 0 && (
        nextLesson ? (
          <Link
            to={`/topic/${topic.id}/lesson/${nextLesson.slug}`}
            className="flex items-center gap-4 rounded-2xl border border-brand/40 bg-brand/10 px-5 py-4 transition hover:bg-brand/20"
          >
            <span className="text-2xl" aria-hidden="true">
              ▶
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-brand-soft">
                {readCount === 0
                  ? 'Start here'
                  : `Continue · ${readCount} of ${topic.lessons.length} read`}
              </span>
              <span className="block font-medium text-strong">
                {nextIndex + 1}. {nextLesson.title}
              </span>
            </span>
            <span className="text-faint">→</span>
          </Link>
        ) : (
          <div className="rounded-2xl border border-success/30 bg-success/10 px-5 py-4 text-success">
            ✓ All {topic.lessons.length} lessons read. Lovely work.
            {topic.flashcards.length > 0 && ' Keep it fresh with the flashcards.'}
          </div>
        )
      )}

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

      {related.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            Related topics
          </h2>
          <div className="flex flex-wrap gap-2">
            {related.map((r) => (
              <Link
                key={r.id}
                to={`/topic/${r.id}`}
                className="flex items-center gap-2 rounded-xl border border-line/10 bg-surface px-3 py-2 transition hover:border-line/20"
              >
                <span aria-hidden="true">{r.emoji}</span>
                <span className="font-medium text-strong">{r.title}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

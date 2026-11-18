import { Link } from 'react-router-dom'
import { TOPICS, ALL_FLASHCARDS, ALL_INTERVIEW } from '../content/loadContent.js'
import { topicLessonProgress, getCardStats, getStreak } from '../lib/progress.js'
import { encouragement } from '../lib/encouragement.js'

function ProgressBar({ value, total, accent }) {
  const pct = total ? Math.round((value / total) * 100) : 0
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-fill/10">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: accent }} />
    </div>
  )
}

function TopicCard({ topic }) {
  const lessons = topicLessonProgress(topic)
  const cards = getCardStats(topic.flashcards)
  const done = lessons.total > 0 && lessons.read === lessons.total
  return (
    <Link
      to={`/topic/${topic.id}`}
      className="group flex flex-col rounded-2xl border border-line/10 bg-surface p-5 transition hover:-translate-y-0.5 hover:border-line/20 hover:bg-surface/80"
    >
      <div className="flex items-start gap-3">
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-2xl"
          style={{ background: `${topic.accent}22` }}
        >
          {topic.emoji}
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold text-strong group-hover:text-brand-soft">{topic.title}</h3>
          <p className="mt-0.5 line-clamp-2 text-sm text-muted">{topic.blurb}</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-xs text-muted">
          <span className={done ? 'text-success' : undefined}>
            {done ? '✓ ' : ''}
            {lessons.read}/{lessons.total} lessons
          </span>
          {/* Due is the number that decides whether to open this topic today;
              the deck size alone never changes and so never tells you anything. */}
          <span className={cards.due > 0 ? 'text-brand-soft' : undefined}>
            {cards.due > 0 ? `${cards.due} due` : `${cards.total} cards`}
          </span>
        </div>
        <ProgressBar value={lessons.read} total={lessons.total} accent={topic.accent} />
      </div>
    </Link>
  )
}

// "What should I do right now?" — the one question the landing page was not
// answering. Everything here is already tracked; none of it was ever shown.
function TodayStrip({ lessonsRead, lessonsTotal, cards }) {
  const streak = getStreak()
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <Metric
        label="Due today"
        value={cards.due}
        tone={cards.due > 0 ? 'brand' : 'success'}
        note={cards.due > 0 ? 'cards ready to review' : 'all caught up'}
      />
      <Metric label="Mastered" value={cards.mastered} tone="success" note={`of ${cards.total} cards`} />
      <Metric label="Lessons read" value={lessonsRead} tone="neutral" note={`of ${lessonsTotal}`} />
      <Metric
        label="Streak"
        value={streak > 0 ? `${streak}🔥` : '—'}
        tone={streak > 0 ? 'accent' : 'neutral'}
        note={streak > 0 ? 'days in a row' : 'starts with today'}
      />
    </div>
  )
}

const TONE = {
  brand: 'text-brand',
  success: 'text-success',
  accent: 'text-accent',
  neutral: 'text-strong',
}

function Metric({ label, value, note, tone = 'neutral' }) {
  return (
    <div className="rounded-2xl border border-line/10 bg-surface px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${TONE[tone]}`}>{value}</div>
      <div className="text-[11px] text-faint">{note}</div>
    </div>
  )
}

export default function Home({ onOpenSearch }) {
  const totalLessons = TOPICS.reduce((n, t) => n + t.lessons.length, 0)
  const lessonsRead = TOPICS.reduce((n, t) => n + topicLessonProgress(t).read, 0)
  const cards = getCardStats(ALL_FLASHCARDS)

  return (
    <div className="space-y-8">
      <section className="animate-rise rounded-3xl border border-line/10 bg-gradient-to-br from-surface to-sunken p-8">
        <p className="text-sm text-brand-soft">{encouragement.welcome()}</p>
        <h1 className="mt-2 text-3xl font-bold text-strong sm:text-4xl">
          What do you want to master today?
        </h1>
        <p className="mt-3 max-w-2xl text-muted">
          Pick a topic to read bite-sized lessons, then lock it in with randomized flashcards that
          resurface exactly when you're about to forget them. No pressure, no streaks you can't keep —
          just steady progress.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            to="/flashcards"
            className="rounded-xl bg-brand px-4 py-2 font-medium text-ink shadow-lg shadow-brand/20 hover:bg-brand-soft"
          >
            {cards.due > 0
              ? `🃏 Review ${cards.due} due card${cards.due === 1 ? '' : 's'}`
              : `🃏 Study all flashcards (${ALL_FLASHCARDS.length})`}
          </Link>
          {ALL_INTERVIEW.length > 0 && (
            <Link
              to="/interview"
              className="rounded-xl border border-line/10 bg-fill/5 px-4 py-2 font-medium text-body hover:bg-fill/10"
            >
              🎤 Interview prep ({ALL_INTERVIEW.length})
            </Link>
          )}
          <button
            onClick={onOpenSearch}
            className="rounded-xl border border-line/10 bg-fill/5 px-4 py-2 font-medium text-body hover:bg-fill/10"
          >
            🔎 Search everything
          </button>
          <span className="self-center text-sm text-faint">
            {TOPICS.length} topics · {totalLessons} lessons
          </span>
        </div>
      </section>

      <TodayStrip lessonsRead={lessonsRead} lessonsTotal={totalLessons} cards={cards} />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Topics</h2>
        {TOPICS.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line/15 p-10 text-center text-muted">
            No topics yet. Add a folder under <code className="text-accent">/content</code> to get started —
            see <code className="text-accent">content/CONTENT_GUIDE.md</code>.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TOPICS.map((t) => (
              <TopicCard key={t.id} topic={t} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

import { Link, useParams } from 'react-router-dom'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getTopic } from '../content/loadContent.js'
import { extractSection } from '../lib/takeaways.js'
import { isLessonRead } from '../lib/progress.js'

// One page per topic: every lesson's "Key takeaways", in order. It's the
// thing you want the night before an exam or before visiting family who
// speak the language: the whole topic at a glance, printable.
export default function ReviewPage() {
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

  const sections = topic.lessons
    .map((lesson, i) => ({ lesson, n: i + 1, body: extractSection(lesson.markdown) }))
    .filter((s) => s.body)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted print:hidden">
        <Link to="/" className="hover:text-body">
          Topics
        </Link>
        <span>/</span>
        <Link to={`/topic/${topic.id}`} className="hover:text-body">
          {topic.title}
        </Link>
        <button
          onClick={() => window.print()}
          className="ml-auto rounded-lg border border-line/10 bg-fill/5 px-3 py-1.5 text-body hover:bg-fill/10"
        >
          🖨️ Print
        </button>
      </div>

      <header>
        <h1 className="text-2xl font-bold text-strong">
          {topic.emoji} {topic.title}: review sheet
        </h1>
        <p className="mt-1 text-muted">
          Every lesson's key takeaways on one page. Skim it, and open any lesson where a line
          doesn't ring a bell.
        </p>
      </header>

      {sections.length === 0 ? (
        <p className="text-muted">This topic's lessons don't have takeaway sections yet.</p>
      ) : (
        <ol className="space-y-4">
          {sections.map(({ lesson, n, body }) => (
            <li
              key={lesson.slug}
              className="break-inside-avoid rounded-2xl border border-line/10 bg-surface p-5"
            >
              <h2 className="mb-2 flex items-baseline gap-2 font-semibold text-strong">
                <span className="text-faint">{n}.</span>
                <Link to={`/topic/${topic.id}/lesson/${lesson.slug}`} className="hover:text-brand-soft">
                  {lesson.title}
                </Link>
                {isLessonRead(topic.id, lesson.slug) && (
                  <span className="text-xs font-normal text-success print:hidden">✓ read</span>
                )}
              </h2>
              <div className="lesson-prose max-w-none text-[15px]">
                <Markdown remarkPlugins={[remarkGfm]}>{body}</Markdown>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

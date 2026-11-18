// Search across everything: topics, lessons, flashcards and interview answers.
//
// The library is now 19 topics / 162 lessons / 900-odd cards, and until this
// existed the only way to find where something was explained was to remember
// which topic it lived in. That's a memory test the app is supposed to be
// removing, not adding.
//
// It searches lesson BODIES, not just titles, because the useful question is
// "where was SNI explained?" and no title contains the answer. Everything is
// already in memory as strings (import.meta.glob loads them eagerly), so the
// index costs one pass at startup and no network at all.

import { TOPICS } from '../content/loadContent.js'

// Strip the Markdown that would otherwise pollute a snippet: fences, inline
// code ticks, link syntax, heading marks, emphasis.
function toPlainText(md) {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildIndex() {
  const entries = []

  for (const topic of TOPICS) {
    entries.push({
      kind: 'topic',
      id: `topic:${topic.id}`,
      topic,
      title: topic.title,
      subtitle: `${topic.lessons.length} lessons · ${topic.flashcards.length} cards`,
      body: topic.blurb,
      to: `/topic/${topic.id}`,
    })

    for (const lesson of topic.lessons) {
      entries.push({
        kind: 'lesson',
        id: `lesson:${topic.id}:${lesson.slug}`,
        topic,
        title: lesson.title,
        subtitle: `${topic.title} · ${lesson.minutes} min`,
        body: toPlainText(lesson.markdown),
        to: `/topic/${topic.id}/lesson/${lesson.slug}`,
      })
    }

    for (const card of topic.flashcards) {
      entries.push({
        kind: 'card',
        id: `card:${card.id}`,
        topic,
        title: card.q,
        subtitle: `Flashcard · ${topic.title}`,
        body: card.a,
        to: `/flashcards/${topic.id}`,
      })
    }

    for (const question of topic.interview) {
      entries.push({
        kind: 'interview',
        id: `interview:${question.id}`,
        topic,
        title: question.q,
        subtitle: `${topic.interviewTitle} · ${topic.title}`,
        body: toPlainText(question.a || ''),
        to: `/interview/${topic.id}`,
      })
    }
  }

  // Lowercase once, not on every keystroke.
  for (const e of entries) {
    e._title = e.title.toLowerCase()
    e._body = e.body.toLowerCase()
  }
  return entries
}

export const INDEX = buildIndex()

// A title hit beats a body hit, and an early hit beats a late one — matching
// "TLS" in a lesson called "TLS handshake" should outrank the tenth paragraph
// of an unrelated one. Topics rank above lessons above cards, so typing a
// subject name lands on the subject.
const KIND_BONUS = { topic: 60, lesson: 20, interview: 10, card: 0 }

function scoreEntry(entry, terms) {
  let score = KIND_BONUS[entry.kind] || 0

  for (const term of terms) {
    const inTitle = entry._title.indexOf(term)
    const inBody = entry._body.indexOf(term)
    if (inTitle === -1 && inBody === -1) return 0 // every term must appear somewhere

    if (inTitle !== -1) {
      score += 100
      if (inTitle === 0) score += 40 // starts with the term
      // A whole-word hit is worth more than a hit inside a longer word.
      if (new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(entry._title)) {
        score += 25
      }
    } else {
      score += 20
      if (inBody < 400) score += 10 // near the top of the lesson
    }
  }
  return score
}

// A short window of the body around the first match, so a result explains why
// it matched instead of making you open it to find out.
export function snippetFor(entry, terms) {
  const first = terms
    .map((t) => entry._body.indexOf(t))
    .filter((i) => i !== -1)
    .sort((a, b) => a - b)[0]
  if (first === undefined) return entry.body.slice(0, 140)

  const start = Math.max(0, first - 50)
  const text = entry.body.slice(start, start + 170).trim()
  return (start > 0 ? '…' : '') + text + (start + 170 < entry.body.length ? '…' : '')
}

export function parseTerms(query) {
  return query.toLowerCase().split(/\s+/).filter(Boolean)
}

export function search(query, limit = 25) {
  const terms = parseTerms(query)
  if (terms.length === 0) return []

  const hits = []
  for (const entry of INDEX) {
    const score = scoreEntry(entry, terms)
    if (score > 0) hits.push({ entry, score })
  }
  hits.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
  return hits.slice(0, limit).map((h) => h.entry)
}

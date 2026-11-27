// Progress + lightweight spaced repetition (Leitner boxes).
//
// Persistence model: the SQLite-backed API (/api/state) is the durable source of
// truth, so progress survives across browsers and machines. localStorage is a
// fast, synchronous local cache + offline fallback. On startup call hydrate() to
// pull the latest from the server; every change writes localStorage immediately
// and pushes the full snapshot back to the server (debounced).

import { TOPICS } from '../content/loadContent.js'

const KEY = 'studyforge.progress.v1'
const API = '/api/state'

// Leitner boxes 1..7. Lower box = seen sooner / more often. A correct answer
// promotes a card up a box; a miss sends it back to box 1 (re-learn).
// Boxes 6 and 7 (a month, two months) were added after 1..5: without them a
// well-known card came back every 16 days forever, which is too often for the
// long haul. Nothing moves down: a box-5 card simply has further to climb.
// Keep MAX_BOX in sync with the server's clamp (server/index.js).
const BOX_INTERVALS_DAYS = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 16, 6: 30, 7: 60 }
export const MAX_BOX = 7

const EMPTY = () => ({ lessonsRead: {}, cards: {}, streak: { count: 0, last: null } })

// ---- Card-id migration ----
// Cards used to be keyed by position ("ilocano:12"), so adding a card in the
// middle of a deck moved every later card's progress onto its neighbour. They
// are now keyed by their question ("ilocano:c:1x9k2a"). Saved progress under an
// old positional key is moved to the card that sits at that position today, once.
// Idempotent: new-style keys never look positional, so re-running is a no-op.
const LEGACY_TO_ID = new Map()
for (const topic of TOPICS) {
  for (const card of topic.flashcards) LEGACY_TO_ID.set(card.legacyId, card.id)
}

export function migrateCardIds(cards) {
  let changed = false
  const out = { ...cards }
  for (const key of Object.keys(cards)) {
    const id = LEGACY_TO_ID.get(key)
    if (!id) continue
    // If the card already has progress under its new id, that's newer: keep it.
    if (!out[id]) out[id] = cards[key]
    delete out[key]
    changed = true
  }
  return { cards: out, changed }
}

function readLocal() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY()
    const parsed = JSON.parse(raw)
    const { cards, changed } = migrateCardIds(parsed.cards || {})
    const state = {
      lessonsRead: parsed.lessonsRead || {},
      cards,
      streak: parsed.streak || { count: 0, last: null },
    }
    if (changed) localStorage.setItem(KEY, JSON.stringify(state))
    return state
  } catch {
    return EMPTY()
  }
}

// In-memory cache keeps reads synchronous (components read it during render).
let cache = readLocal()

// ---- Subscriptions: let the UI re-render after async hydrate / changes ----
const subscribers = new Set()
function notify() {
  for (const cb of subscribers) cb()
}
export function subscribeProgress(cb) {
  subscribers.add(cb)
  return () => subscribers.delete(cb)
}

function load() {
  return cache
}

// Debounced push of the whole snapshot to the durable store.
let pushTimer = null
function pushToServer() {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    fetch(API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cache),
    }).catch(() => {
      /* offline or API down — localStorage still holds it; we'll resync later */
    })
  }, 400)
}

function save(state) {
  cache = state
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* storage full or unavailable — fail quietly, progress is best-effort */
  }
  pushToServer()
  notify()
}

// Pull durable state from the server on startup and adopt it as the truth.
// Falls back silently to the localStorage cache if the API is unreachable.
export async function hydrate() {
  try {
    const res = await fetch(API)
    if (!res.ok) return
    const server = await res.json()
    const { cards, changed } = migrateCardIds(server.cards || {})
    const state = {
      lessonsRead: server.lessonsRead || {},
      cards,
      streak: server.streak || { count: 0, last: null },
    }
    if (changed) {
      save(state) // writes the cache, pushes the migrated snapshot back, notifies
      return
    }
    cache = state
    try {
      localStorage.setItem(KEY, JSON.stringify(cache))
    } catch {
      /* ignore cache write failure */
    }
    notify()
  } catch {
    /* API unreachable — keep using the local cache */
  }
}

// Calendar dates are LOCAL, never UTC. `toISOString()` yields the UTC date, so
// anywhere west of Greenwich an evening session is filed under *tomorrow*:
// study at 8pm and again at 10am the next morning and the streak sees a single
// day instead of two, while a card graded that evening comes back a day late.
// Both failures are silent — the streak just quietly stops counting.
function dateStr(d = new Date()) {
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

function todayStr() {
  return dateStr()
}

// Both dates are parsed as local midnight (no trailing Z), and rounded rather
// than floored: across a daylight-saving boundary a "day" is 23 or 25 hours,
// and flooring 23 hours gives 0 — a card that would never come due.
function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00`) - Date.parse(`${a}T00:00:00`)) / 86400000)
}

// ---- Lessons ----

export function markLessonRead(topicId, slug) {
  const state = load()
  state.lessonsRead[`${topicId}:${slug}`] = todayStr()
  bumpStreak(state)
  save(state)
}

// Undo a mis-click. Deliberately does NOT touch the streak: you did open the
// app today, and taking a day back because you corrected a checkbox would be
// exactly the kind of petty bookkeeping this app is supposed to avoid.
export function markLessonUnread(topicId, slug) {
  const state = load()
  delete state.lessonsRead[`${topicId}:${slug}`]
  save(state)
}

export function isLessonRead(topicId, slug) {
  return Boolean(load().lessonsRead[`${topicId}:${slug}`])
}

export function topicLessonProgress(topic) {
  const state = load()
  const read = topic.lessons.filter((l) => state.lessonsRead[`${topic.id}:${l.slug}`]).length
  return { read, total: topic.lessons.length }
}

// ---- Flashcards (Leitner) ----

function cardState(state, cardId) {
  return state.cards[cardId] || { box: 1, due: todayStr(), seen: 0, correct: 0 }
}

export function isCardDue(cardId) {
  const c = cardState(load(), cardId)
  return daysBetween(c.due, todayStr()) >= 0
}

// Grade a card: 'again' (missed) resets to box 1; 'good'/'easy' promote it.
export function gradeCard(cardId, grade) {
  const state = load()
  const c = cardState(state, cardId)
  c.seen += 1
  if (grade === 'again') {
    c.box = 1
  } else {
    c.correct += 1
    const step = grade === 'easy' ? 2 : 1
    c.box = Math.min(MAX_BOX, c.box + step)
  }
  const interval = BOX_INTERVALS_DAYS[c.box] ?? 0
  const due = new Date()
  due.setDate(due.getDate() + interval)
  c.due = dateStr(due)
  state.cards[cardId] = c
  bumpStreak(state)
  save(state)
  return c
}

export function getCardStats(cards) {
  const state = load()
  let due = 0
  let mastered = 0 // box 4+ counts as "sticking"
  for (const card of cards) {
    const c = cardState(state, card.id)
    if (daysBetween(c.due, todayStr()) >= 0) due += 1
    if (c.box >= 4) mastered += 1
  }
  return { due, mastered, total: cards.length }
}

// Order a deck for a session: due-and-lowest-box first, then a stable shuffle of
// the rest. Box weighting means struggling cards resurface more often.
export function orderForSession(cards, { onlyDue = false, shuffle = true } = {}) {
  const state = load()
  let pool = cards.map((card) => ({ card, meta: cardState(state, card.id) }))
  if (onlyDue) {
    pool = pool.filter((p) => daysBetween(p.meta.due, todayStr()) >= 0)
  }
  if (shuffle) {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
  }
  // Lower boxes (less learned) bubble to the front, but shuffle breaks ties.
  pool.sort((a, b) => a.meta.box - b.meta.box)
  return pool.map((p) => p.card)
}

// ---- Streak ----

function bumpStreak(state) {
  const today = todayStr()
  const { last, count } = state.streak
  if (last === today) return
  if (last && daysBetween(last, today) === 1) {
    state.streak = { count: count + 1, last: today }
  } else {
    state.streak = { count: 1, last: today }
  }
}

export function getStreak() {
  const { count, last } = load().streak
  if (!last) return 0
  // Streak is only "live" if studied today or yesterday.
  return daysBetween(last, todayStr()) <= 1 ? count : 0
}

export function resetAllProgress() {
  cache = EMPTY()
  localStorage.removeItem(KEY)
  fetch('/api/reset', { method: 'POST' }).catch(() => {})
  notify()
}

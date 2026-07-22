#!/usr/bin/env node
// StudyForge content validator.
//
// Checks every topic under content/ against the contract in
// content/CONTENT_GUIDE.md — the things that silently drop content from the UI
// or quietly degrade a lesson, which no amount of eyeballing catches reliably.
//
//   npm run validate:content
//
// Exit code 0 = all good (warnings may still print), 1 = at least one error.
// Errors break the contract; warnings are quality nudges you may accept.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONTENT = join(ROOT, 'content')

const errors = []
const warnings = []
const err = (where, msg) => errors.push(`${where}: ${msg}`)
const warn = (where, msg) => warnings.push(`${where}: ${msg}`)

const isDir = (p) => existsSync(p) && statSync(p).isDirectory()

/** Parse JSON, reporting a readable error instead of throwing. */
function readJson(path, where) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    err(where, `invalid JSON — ${e.message}`)
    return null
  }
}

/**
 * Count H1 headings, ignoring fenced code blocks — a `# comment` inside a
 * ```bash block is not a heading, and naive counting flags it as one.
 */
function countH1(markdown) {
  let inFence = false
  let count = 0
  for (const line of markdown.split('\n')) {
    if (line.startsWith('```')) {
      inFence = !inFence
      continue
    }
    if (!inFence && /^# \S/.test(line)) count++
  }
  return count
}

/**
 * Fenced code blocks must be balanced — an unclosed fence swallows the rest of
 * the lesson. We deliberately do NOT require a language tag: untagged fences are
 * used throughout for ASCII diagrams, where highlighting would be wrong.
 */
function checkFences(markdown, where) {
  const fences = markdown.split('\n').filter((l) => l.startsWith('```'))
  if (fences.length % 2 !== 0) {
    err(where, 'unbalanced code fence (odd number of ``` lines)')
  }
}

function validateLesson(topicId, file, path) {
  const where = `${topicId}/lessons/${file}`
  const md = readFileSync(path, 'utf8')

  if (!/^\d{2,}-[a-z0-9-]+\.md$/.test(file)) {
    err(where, 'filename must be NN-kebab-slug.md (the NN prefix sets lesson order)')
  }

  const h1 = countH1(md)
  if (h1 === 0) err(where, 'no `# H1` title — the first H1 becomes the lesson title')
  else if (h1 > 1) err(where, `${h1} H1 headings — there must be exactly one`)

  if (!md.includes('## Check yourself')) warn(where, 'missing a `## Check yourself` section')
  if (!md.includes('## Key takeaways')) warn(where, 'missing a `## Key takeaways` section')

  checkFences(md, where)

  const words = md.split(/\s+/).filter(Boolean).length
  if (words < 300) warn(where, `only ${words} words — lessons should teach a real concept`)

  return { words, order: parseInt(file, 10) }
}

function validateCards(topicId, path) {
  const where = `${topicId}/flashcards.json`
  const cards = readJson(path, where)
  if (cards === null) return 0
  if (!Array.isArray(cards)) {
    err(where, 'must be a JSON array of card objects')
    return 0
  }

  const seen = new Map()
  cards.forEach((c, i) => {
    const at = `${where}[${i}]`
    if (typeof c?.q !== 'string' || !c.q.trim()) err(at, 'missing a non-empty `q`')
    if (typeof c?.a !== 'string' || !c.a.trim()) err(at, 'missing a non-empty `a`')
    if (c?.tags && !Array.isArray(c.tags)) err(at, '`tags` must be an array')
    if (typeof c?.q === 'string') {
      const key = c.q.trim().toLowerCase()
      if (seen.has(key)) warn(at, `duplicate question (also at index ${seen.get(key)})`)
      else seen.set(key, i)
    }
  })
  return cards.length
}

function validateInterview(topicId, path) {
  const where = `${topicId}/interview.json`
  const qs = readJson(path, where)
  if (qs === null) return 0
  if (!Array.isArray(qs)) {
    err(where, 'must be a JSON array of question objects')
    return 0
  }
  qs.forEach((x, i) => {
    const at = `${where}[${i}]`
    if (typeof x?.q !== 'string' || !x.q.trim()) err(at, 'missing a non-empty `q`')
    if (typeof x?.a !== 'string' || !x.a.trim()) err(at, 'missing a non-empty `a`')
    if (!x?.category) warn(at, 'no `category` — it will fall back to "General"')
  })
  return qs.length
}

function validateTopic(topicId) {
  const dir = join(CONTENT, topicId)

  const topicPath = join(dir, 'topic.json')
  if (!existsSync(topicPath)) {
    err(topicId, 'no topic.json — the folder will not be discovered as a topic')
    return null
  }
  const meta = readJson(topicPath, `${topicId}/topic.json`)
  if (meta) {
    if (meta.id !== topicId) {
      err(`${topicId}/topic.json`, `id "${meta.id}" must equal the folder name "${topicId}"`)
    }
    if (!meta.title) err(`${topicId}/topic.json`, 'missing `title`')
    if (!meta.blurb) warn(`${topicId}/topic.json`, 'missing `blurb` (shown on the topic card)')
    if (meta.accent && !/^#[0-9a-fA-F]{3,8}$/.test(meta.accent)) {
      err(`${topicId}/topic.json`, `accent "${meta.accent}" is not a hex color`)
    }
  }

  const lessonsDir = join(dir, 'lessons')
  if (!isDir(lessonsDir)) {
    err(topicId, 'no lessons/ directory')
    return null
  }
  const files = readdirSync(lessonsDir)
    .filter((f) => f.endsWith('.md'))
    .sort()
  if (files.length === 0) err(topicId, 'lessons/ contains no .md files')

  const orders = new Map()
  let words = 0
  for (const f of files) {
    const res = validateLesson(topicId, f, join(lessonsDir, f))
    if (!res) continue
    words += res.words
    if (Number.isInteger(res.order)) {
      if (orders.has(res.order)) {
        err(`${topicId}/lessons`, `duplicate order prefix ${res.order}: ${orders.get(res.order)} and ${f}`)
      } else orders.set(res.order, f)
    }
  }

  const cardsPath = join(dir, 'flashcards.json')
  const cards = existsSync(cardsPath) ? validateCards(topicId, cardsPath) : 0
  if (!existsSync(cardsPath)) warn(topicId, 'no flashcards.json — the topic has no deck')

  const interviewPath = join(dir, 'interview.json')
  const interview = existsSync(interviewPath) ? validateInterview(topicId, interviewPath) : 0

  return { topicId, lessons: files.length, cards, interview, words }
}

// ---- Run ----
if (!isDir(CONTENT)) {
  console.error('No content/ directory found.')
  process.exit(1)
}

const topicIds = readdirSync(CONTENT)
  .filter((f) => isDir(join(CONTENT, f)))
  .sort()

const rows = topicIds.map(validateTopic).filter(Boolean)

console.log(`\nStudyForge content check — ${rows.length} topics\n`)
console.log(`  ${'topic'.padEnd(16)} ${'lessons'.padStart(7)} ${'cards'.padStart(6)} ${'interview'.padStart(9)} ${'words'.padStart(7)}`)
for (const r of rows) {
  console.log(
    `  ${r.topicId.padEnd(16)} ${String(r.lessons).padStart(7)} ${String(r.cards).padStart(6)} ` +
      `${String(r.interview || '-').padStart(9)} ${String(r.words).padStart(7)}`,
  )
}

const totals = rows.reduce(
  (a, r) => ({ lessons: a.lessons + r.lessons, cards: a.cards + r.cards, interview: a.interview + r.interview }),
  { lessons: 0, cards: 0, interview: 0 },
)
console.log(
  `\n  totals: ${totals.lessons} lessons · ${totals.cards} flashcards · ${totals.interview} interview questions\n`,
)

if (warnings.length) {
  console.log(`⚠️  ${warnings.length} warning(s):`)
  for (const w of warnings) console.log(`   - ${w}`)
  console.log('')
}

if (errors.length) {
  console.log(`❌ ${errors.length} error(s):`)
  for (const e of errors) console.log(`   - ${e}`)
  console.log('\nThese break the content contract — the app may silently drop content.\n')
  process.exit(1)
}

console.log('✅ All topics satisfy the content contract.\n')

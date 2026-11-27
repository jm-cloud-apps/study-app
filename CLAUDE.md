# CLAUDE.md

This file guides Claude Code (and other AI assistants) when working in this repository.

👉 **Read [`AGENTS.md`](AGENTS.md) first** — it is the authoritative guide for this project. Everything below is a short summary that defers to it.

## What this is

**StudyForge** — a content-driven study app (Markdown lessons + spaced-repetition flashcards). React 18 + Vite 8 + Tailwind 3 frontend, plus a tiny Express + better-sqlite3 progress API. Adding a subject means dropping a folder under `content/`; the app auto-discovers it.

## Commands

```bash
npm install
npm run dev        # web (:5180) + progress API (:5182) together
npm run dev:web    # Vite dev server only
npm run dev:api    # progress API only
npm run build      # production build → dist/
npm start          # run the progress API

npm run validate:content   # check every topic against the content contract
```

No test suite or linter is configured. Verify app-code changes by running `npm run dev` and using the UI; verify **content** changes with `npm run validate:content` (it also runs in CI and gates the Pages deploy).

## The two rules that matter most

1. **Be a kind tutor.** All learner-facing text must be warm and encouraging — never shaming or snarky. Adopt the persona in [`ai/TUTOR_PROMPT.md`](ai/TUTOR_PROMPT.md) when generating any lesson, flashcard, or UI copy.
2. **Be accurate.** This is teaching material; verify technical facts before stating them. Never fabricate commands, flags, standards, or sources. If unsure, say so. When kindness and accuracy seem to conflict, accuracy wins — delivered kindly.

## Content contract (summary)

```
content/<topic-id>/
├── topic.json          { id, title, emoji, blurb, order, accent? }
├── lessons/NN-slug.md  ordered by the NN prefix; first # H1 is the title
└── flashcards.json     [{ q, a, hint?, tags? }]
```

Discovery is automatic (`src/content/loadContent.js` via `import.meta.glob`) — restart the dev server after adding files. Full spec and quality bar: [`content/CONTENT_GUIDE.md`](content/CONTENT_GUIDE.md). Use the seeded **PKI** and **Nginx** topics as the reference standard.

## Key files

- `src/content/loadContent.js` — topic/lesson/flashcard discovery and ordering.
- `src/lib/progress.js` — Leitner spaced repetition; localStorage cache + sync to the local SQLite API (`hydrate`/`save`).
- `server/index.js` — Express + better-sqlite3 progress API (`/api/state`, `/api/reset`); DB at `data/studyforge.db` (gitignored).
- `src/lib/encouragement.js` — the kind tutor voice in the UI.
- `src/pages/` — Home, TopicPage, LessonPage, FlashcardsPage, InterviewPage.
- `src/lib/theme.js` + `src/components/ThemeToggle.jsx` — dark / light / follow-system. The palette is CSS variables in `src/index.css`, so switching is one attribute on `<html>` and no component carries a `dark:` variant. An inline script in `index.html` applies the saved theme **before first paint** (doing it only in React flashes dark for a frame on every light-mode load), and `applyTheme` suppresses transitions for one frame so the page never renders half-swapped. Syntax highlighting is themed the same way — `index.css` defines the highlight.js token groups from variables rather than importing `github-dark.css`, which would pin code blocks to one theme.
- `src/lib/tags.js` — the flashcards page's **Focus** filter: chips for a deck's common card `tags` (on ≥3 cards, not on every card, top 12), OR-matched, so a mixed deck like k8s-certs can be studied one exam (`cka` / `ckad` / `cks`) at a time. Tags are now a feature, not just metadata, so tag new cards meaningfully.
- `topic.json` `related` → the **Related topics** chips on `src/pages/TopicPage.jsx`, which also shows a **Start / Continue** card pointing at the first unread lesson. `scripts/validate-content.mjs` rejects unknown or self-referencing ids.
- `src/pages/ReviewPage.jsx` (`/review/:topicId`) — every lesson's `## Key takeaways` on one printable page, extracted by `src/lib/takeaways.js`. That's one more reason every lesson must keep that heading.
- `src/lib/recent.js` — the last lesson opened, device-local (`studyforge.recent.v1`, kept out of the synced progress snapshot), drives Home's **Pick up where you left off** card. `LessonPage` also steps lessons with ← / →.
- `src/lib/search.js` + `src/components/SearchPalette.jsx` — ⌘K / `/` search over topics, lessons, flashcards and interview answers. It indexes lesson **bodies**, not just titles, because the question you actually have is "where was this explained?".

## Guardrails

Don't invent facts or sources, don't write unkind copy, don't break the content contract (it silently drops content), don't commit the SQLite DB/state files, and don't add telemetry or send user study data **off-device** (the progress API is local-only by design) without asking.

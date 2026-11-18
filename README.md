# 🎓 StudyForge

**Learn anything, one card at a time.** A content-driven study app: read bite-sized lessons, then lock the material in with **randomized, spaced-repetition flashcards**. Adding a new subject is as simple as dropping a folder of Markdown + JSON — no app code required, which makes it easy for both humans *and* AI assistants to extend.

> Comes seeded with a full **platform-engineering track**: PKI & Certificates · Nginx · Linux & systemd · Networking Fundamentals · DNS · HTTP · Git Branching · Containers & Docker · Kubernetes · OpenShift (in depth) · CI/CD · Argo CD · Terraform & IaC · Observability · ELK / Elastic Stack · Dynatrace — plus a **Red Hat certification track** (RHCSA EX200 and RHCE EX294) whose exam-style practice tasks ship with worked solutions, and a Tagalog language topic.

---

## Quick start

```bash
cd study-app
npm install
npm run dev          # starts the web app (:5180) AND the progress API (:5182)
```

`npm run dev` runs both processes together (via `concurrently`). To run them separately:

```bash
npm run dev:web      # Vite dev server only (:5180)
npm run dev:api      # progress API only (:5182)
```

Build for production:

```bash
npm run build        # outputs to dist/
npm run preview      # serve the production build locally
npm start            # run the progress API (e.g. behind a static host in prod)
```

Requirements: Node 18+ (developed on Node 22). The API uses `better-sqlite3` (a native module compiled on `npm install`).

---

## What's inside

| Feature | Notes |
|---|---|
| 📚 **Topics & lessons** | Markdown lessons with code highlighting, reading-time estimates, prev/next nav, and "read" tracking. |
| 🃏 **Randomized flashcards** | Shuffled every session, with self-grading (**Again / Good / Easy**). Pick a session length (10 / 25 / 50 / all) so a study block is something you can finish. Keyboard throughout: <kbd>←</kbd> <kbd>→</kbd> to move, <kbd>Space</kbd> to flip, <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> to grade. |
| 🧠 **Spaced repetition** | A lightweight **Leitner box** system resurfaces hard cards sooner and eases off mastered ones. |
| 🔥 **Streaks & progress** | Persisted to a **local SQLite database** via a tiny API, so progress survives across browsers and machines. localStorage is a fast offline cache; nothing leaves your machine. |
| 🔎 **Search everything** | <kbd>⌘K</kbd> (or <kbd>/</kbd>) searches every topic, lesson, flashcard and interview answer — including **lesson body text**, so you can find where something was explained without remembering which topic it was in. |
| 🌗 **Light & dark themes** | Dark, light, or follow your system. The whole palette is CSS variables, so the theme switches instantly and code blocks follow it too. Both themes are measured to clear WCAG AA contrast. |
| 💬 **A kind tutor voice** | Encouraging, never-shaming microcopy throughout. See [`ai/TUTOR_PROMPT.md`](ai/TUTOR_PROMPT.md). |

---

## Project structure

```
study-app/
├── content/                    ← ALL study material lives here
│   ├── CONTENT_GUIDE.md        ← how to author a topic (read this to add content)
│   ├── pki/
│   │   ├── topic.json          ← metadata
│   │   ├── lessons/*.md        ← ordered Markdown lessons (NN-slug.md)
│   │   └── flashcards.json     ← [{ q, a, hint?, tags? }]
│   ├── nginx/  linux/  networking/  dns/  git/  containers/
│   ├── kubernetes/  cicd/  terraform/  observability/
│   └── elk/  dynatrace/
├── server/
│   └── index.js                ← progress API (Express + better-sqlite3)
├── data/                       ← SQLite database lives here (gitignored)
├── src/
│   ├── content/loadContent.js  ← auto-discovers every topic in /content
│   ├── lib/progress.js         ← Leitner spaced repetition; localStorage cache + SQLite sync
│   ├── lib/search.js           ← the ⌘K index over lessons, cards and questions
│   ├── lib/theme.js            ← dark / light / system, applied via a CSS-variable palette
│   ├── lib/encouragement.js    ← the "nice AI" voice
│   ├── components/             ← SearchPalette, ThemeToggle, CardText
│   ├── pages/                  ← Home, Topic, Lesson, Flashcards, Interview
│   └── App.jsx, main.jsx
├── AGENTS.md                   ← instructions for AI assistants (start here if you're an AI)
├── CLAUDE.md                   ← points Claude Code at AGENTS.md
└── README.md                   ← you are here
```

### How progress persistence works

The browser keeps a fast `localStorage` cache and treats the SQLite-backed API as the source of truth: on startup it **hydrates** from `GET /api/state`, and every change writes localStorage immediately and pushes the full snapshot to `PUT /api/state` (debounced). The DB file (`data/studyforge.db`) is **gitignored** — your progress is yours and never committed. Vite proxies `/api/*` to the API (port 5182). If the API is down, the app still works from the local cache.

### Security

StudyForge is local and single-user, and ships **secure by default**: the API binds to **loopback only** (`127.0.0.1`), uses a **CORS allowlist** (no wildcard), rejects cross-origin writes, and never exposes filesystem paths. SQL is fully parameterized and lessons render without raw HTML. See [`SECURITY.md`](SECURITY.md) for the full threat model and the env vars (`API_HOST`, `STUDYFORGE_ALLOWED_ORIGINS`, …) you can set to deliberately relax the defaults.

**Password gate:** the GitHub Pages deployment is protected by a client-side password gate (a deterrent, not real security — see the Deploy section). It is **disabled during local development** (`npm run dev`) so you never need a password locally, and **enabled in production builds** (what Pages serves). To test the gate locally, run `VITE_FORCE_PASSWORD=true npm run dev`.

---

## Adding a new topic (the 60-second version)

1. Create `content/<your-topic>/topic.json`:
   ```json
   { "id": "your-topic", "title": "Your Topic", "emoji": "🚀", "blurb": "One-line description.", "order": 3 }
   ```
2. Add lessons as `content/<your-topic>/lessons/01-intro.md`, `02-….md`, … (the number sets the order; the first `# H1` becomes the title).
3. Add `content/<your-topic>/flashcards.json` — an array of `{ "q": "...", "a": "..." }`.
4. Restart `npm run dev`. Your topic appears automatically.

Full authoring contract and quality bar: **[`content/CONTENT_GUIDE.md`](content/CONTENT_GUIDE.md)**.

---

## AI-ready

This repo is designed to be extended by AI coding assistants. If you're an AI (or pointing one here), read **[`AGENTS.md`](AGENTS.md)** first — it explains the content contract, the tutor tone to preserve, and the guardrails for writing accurate educational material.

---

## Tech

**Frontend:** React 18 · Vite 8 · Tailwind CSS 3 · react-markdown + rehype-highlight · react-router.

Every colour in the UI resolves through a CSS variable (see `src/index.css` and `tailwind.config.js`), which is why light mode needed no `dark:` variant anywhere — it's one `data-theme` attribute on `<html>`. If you're adding UI, reach for the semantic tokens (`surface`, `border-line/10`, `text-muted`, `success`…) rather than a literal colour.
**Backend:** a tiny Express + better-sqlite3 progress API (no cloud, no telemetry — the SQLite file stays on your machine and is gitignored).

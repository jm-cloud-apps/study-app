# Security Model

StudyForge runs in **two deployments**, and they have different postures:

| Deployment | What runs | Posture |
|---|---|---|
| **Local** (`npm run dev`) | The Vite frontend **plus** the Express + SQLite progress API | Single-user, loopback-only, unauthenticated by design |
| **GitHub Pages** (public) | The **static frontend only** — no API, no server, no database | Public content behind a client-side password gate |

Everything below applies to the local deployment unless it says otherwise. See [Public deployment](#public-deployment-github-pages) for the hosted site.

## Threat model (local)

- The progress API ([`server/index.js`](server/index.js)) stores **low-sensitivity study progress** (which lessons you've read, flashcard boxes, streak) in a local SQLite file. There is **no authentication** — the security boundary is "your own machine," not user accounts.
- The realistic threats we defend against are: (1) another device on your **local network** reaching the API, and (2) a **malicious website** you visit using your browser to read or tamper with the local API.

## Controls in place

| Control | Where | Protects against |
|---|---|---|
| **Loopback-only bind** (`127.0.0.1`) | `app.listen(PORT, HOST)` | Local-network access to the unauthenticated API |
| **CORS allowlist** (no wildcard) | `cors({ origin: ALLOWED_ORIGINS })` | A malicious site reading API responses cross-origin |
| **Origin check on mutations** (PUT/POST → 403 on foreign Origin) | middleware | CSRF-style writes/reset from a visited site |
| **Body validation + clamping** | `PUT /api/state` | Malformed payloads (400) and out-of-range values |
| **Parameterized SQL** (better-sqlite3 prepared statements) | all queries | SQL injection |
| **No DB path in `/api/health`** | health endpoint | Filesystem/username info disclosure |
| **Markdown without raw HTML** (react-markdown, no `rehype-raw`) | `LessonPage` | Stored XSS via lesson content |
| **DB & state gitignored** | `.gitignore` | Committing personal progress / data files |

## Configuration (secure by default)

These environment variables let you relax the defaults **deliberately** — leave them unset for the secure local setup:

| Variable | Default | Notes |
|---|---|---|
| `API_HOST` | `127.0.0.1` | Set to `0.0.0.0` only if you intentionally serve the API on a network interface — **and add your own authentication/reverse proxy first.** |
| `API_PORT` | `5182` | API port. |
| `STUDYFORGE_ALLOWED_ORIGINS` | `http://localhost:5180,http://127.0.0.1:5180` | Comma-separated browser origins allowed to call the API directly (e.g. if you serve the built frontend from a different origin in production). |
| `STUDYFORGE_DB` | `data/studyforge.db` | DB file location. |

## Public deployment (GitHub Pages)

Every push to `main` builds the frontend and publishes it to **https://jm-cloud-apps.github.io/study-app/** via [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml). This changes the picture in two ways worth stating plainly:

- **The progress API is not deployed.** Pages is static hosting — there is no server and no database. The hosted site keeps progress in `localStorage` only, so **no user data leaves the device** and none of it reaches a server we run.
- **The password gate is a deterrent, not access control.** [`src/auth/config.js`](src/auth/config.js) compares a SHA-256 hash **in the browser**, so anyone determined can read the lesson content out of the JS bundle. The build takes the hash from the `VITE_STUDYFORGE_PASSWORD_HASH` repo variable (falling back to `sha256("changeme")` if unset — set the variable).

> ⚠️ Treat everything in `content/` as **public**. It's study material, which is fine — but never put anything private behind that gate.

## Dependency audit

`npm audit` is **clean (0 vulnerabilities)** as of 2026-07-21, and is now **enforced in CI**: the `verify` job in the deploy workflow fails the build on high/critical advisories before anything is published.

Current overrides that keep it clean:

| Override | Why |
|---|---|
| `shell-quote@^1.10.0` | Clears the quadratic-complexity DoS advisory (`<=1.8.4`) reached via the dev-only `concurrently`. |
| `body-parser@^1.20.6` | Express 4.22 still pins 1.20.5; 1.20.6 fixes the invalid-`limit` DoS advisory. |

Re-check with `npm audit` after any dependency change, and update this section rather than leaving it asserting a state that's no longer true.

## Content validation

`npm run validate:content` ([`scripts/validate-content.mjs`](scripts/validate-content.mjs)) enforces the content contract — JSON validity, exactly one `# H1` per lesson (ignoring code fences), `NN-slug.md` naming, no duplicate order prefixes, required card fields. It runs in CI too. This isn't a security control; it catches the failure mode where malformed content is **silently dropped** from the UI instead of erroring.

## Known / accepted items

- **No authentication by design (local):** appropriate for a local single-user tool. If you deploy this for multiple users or on a shared host, add authentication and TLS in front of the API and bind it accordingly.
- **Client-side gate only (Pages):** accepted because the content is non-sensitive study material. Anything requiring real access control needs a server, not a hash in a bundle.

## Reporting

This is a personal project. If you find a security issue, open an issue (or, for anything sensitive, contact the repository owner directly) rather than filing a public exploit.

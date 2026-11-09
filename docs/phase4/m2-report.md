# M2 Report — Streaming chat + persistence

Date: 2026-11-06 · Status: **implemented, awaiting go-ahead for M3**

## Results (commands actually run, final state)
| Check | Result |
|---|---|
| `pnpm typecheck` / `lint` / `format:check` | pass |
| `pnpm test` (unit) | pass — 7 files, 39 tests |
| `pnpm test:integration` (real Postgres test DB + real Redis + real Anthropic SDK against a fake server) | pass — 3 files, 29 tests |
| `pnpm test:e2e` (Playwright/Chromium, dev server + fake Anthropic) | pass — 22 tests |
| `pnpm build` | pass |
| `pnpm audit --prod --audit-level=high` | no known vulnerabilities |
| **Production build in a real browser** (`next start`, injected `__Host-` session cookie) | auth accepted, text streamed mid-response, Stop → `stopped`, URL became `/c/<id>`, production CSP (nonce, no `unsafe-eval`), **no console errors** |

## What was built
- **Data:** `conversations`, `messages` (tree via `parent_id`), `usage_counters`; migration `chat`.
- **Verified upstream facts (were assumptions A1/A2):** streaming event names and the four model IDs, checked against the public docs. Thinking is adaptive/always-on for these models, so the mapper ignores `thinking_delta`/`signature_delta`.
- **API:** `GET/POST /api/conversations`, `GET/PATCH/DELETE /api/conversations/{id}`, `POST /api/conversations/{id}/messages` (SSE), `POST /api/messages/{id}/regenerate` (SSE), `POST /api/messages/{id}/stop`, `GET /api/models`. Errors are RFC 9457 problem+json.
- **Safety:** all data access via a repository requiring `userId` (ADR-004); CSRF = same-origin + custom header; per-user rate limit (Redis fixed window; in-memory fallback), daily token quota, max 2 concurrent streams; stable error codes with no upstream text; same-origin SSE with no CORS headers.
- **UI:** real chat (streaming text, stop button and Esc, regenerate, edit-and-resend, version switcher for branches, model picker persisted per conversation, error banners, polite status region instead of per-token announcements), sidebar history, `/new` → `/c/<id>` without remount.

## Bugs found by tests and fixed
1. **Closure bug (would have shipped):** `message.start` handler read a mutable `assistantId` inside a React updater that ran after reassignment, so every `text.delta` was silently dropped while streaming. Found only because the SLOW e2e tests require mid-stream text; the earlier "passing" fast tests masked it.
2. **Wrong fix, reverted:** I first blamed remounting and used `router.replace` after streaming; that remounted the page mid-interaction and wiped in-flight state. Final design: `history.replaceState` for the URL, and a client-side history reload (no `router.refresh`), so the component never remounts.
3. **A11y:** conversation page had no `<h1>` once messages existed (axe `page-has-heading-one`) → visually hidden `<h1>`.
4. **Layering:** `HttpError` lived in a module that imported Auth.js, breaking server-side tests → moved to `server/errors.ts`.
5. Test-only: Next's route announcer is also `role="alert"`; model-persistence test raced its own PATCH.

## Deviations / not verified
- **Real Anthropic API never called.** No API key was available; all LLM behavior is tested against a fake server I wrote from the documented wire format. A live smoke test is still needed once you provide `ANTHROPIC_API_KEY` (and a spending cap). The fake and the SDK could disagree with the live API in ways I can't see.
- **GitHub OAuth still untested** (no credentials).
- **CSRF design changed** from the planned double-submit token to same-origin + custom header (documented in the security model). Not independently pen-tested.
- **Single-process assumptions:** the in-flight registry (stop-by-id, concurrency cap) and the in-memory limiter fallback are per-process. Fine for one instance; needs Redis-backed state before scaling out.
- **Quota accounting is approximate:** if the upstream reports no output tokens (e.g. a stopped stream), output tokens are estimated as chars/4.
- **Title** is just the first 60 characters of the first message (no LLM-generated titles). **Rename/delete/search UI** and attachments are M4, not built (API for rename/delete exists and is tested only via the repository, not via UI).
- **Messages render as plain text** (markdown/code is M3).
- **Pagination** of history: list is capped at 50, no cursor yet (`next_cursor` is always null).
- **CI updated** (Postgres + Redis services, `prisma generate`, integration tests) but **still never executed**: no git repo/remote.
- **Dev DB note:** the test suite uses a separate `deepresearch_test` database; e2e uses the dev database with unique `@example.test` users, which accumulate (harmless, not cleaned up).
- Not measured: time-to-first-token, memory under many concurrent streams, load. The M6 SSE load test covers this.
- Containers (Postgres, Redis) and Docker Desktop are still running on your machine.

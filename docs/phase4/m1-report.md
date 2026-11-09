# M1 Report — Auth + shell layout + /new

Date: 2026-11-06 · Status: **implemented, awaiting go-ahead for M2**

## Results (commands actually run, final state)
| Check | Result |
|---|---|
| `pnpm typecheck` / `lint` / `format:check` | pass |
| `pnpm test` (Vitest) | pass — 3 files, 11 tests (env, CSP builder, dev-login guard) |
| `pnpm test:e2e` (Playwright, Chromium) | pass — 9 tests |
| `pnpm build` | pass |
| `pnpm audit --prod --audit-level=high` | no known vulnerabilities (after override, below) |
| Production-build page load in real browser | 200, nonce CSP present, **no console/CSP errors** |

E2E covers: unauthenticated `/new` → `/signin`; sign-in lands on `/new` with focused composer and empty history; session cookie `HttpOnly`, `SameSite=Lax`, `path=/`; nonce CSP + nosniff + X-Frame-Options; sign-out re-protects `/new`; theme toggle persists across reload; axe (WCAG rules axe covers) clean on sign-in and `/new` in light and dark; 360 px sidebar open/close.

## What was built
Prisma (Postgres 16 in Docker; migration `init_auth`: users, accounts, sessions, verification_tokens) · Auth.js v5 with database sessions and GitHub provider (activates only when `AUTH_GITHUB_ID/SECRET` set) · protected `(app)` layout validating the session server-side · sidebar (new chat, empty history, user + sign-out), top bar, responsive drawer · `/new` empty state with focused, labelled composer (send disabled until M2) · light/dark theme via cookie (server-rendered, no inline script) · `proxy.ts` nonce-based CSP · dev-only login.

## Bugs found and fixed during M1
1. Hydration mismatch in the theme toggle (client read `document` while server rendered light) → theme now passed from server.
2. Production CSP blocked inline `style` attributes (from `next/image`), invisible in dev → added `style-src-attr 'unsafe-inline'` only; `<style>` elements remain nonce-gated.
3. High-severity advisory in transitive `deepmerge-ts` (via Prisma config) → pnpm override `>=8`; `prisma generate` and `migrate status` verified afterward.

## Deviations / not verified
- **GitHub OAuth is untested**: no OAuth app/credentials. Only the dev login path was exercised. The GitHub button renders only when credentials exist, and that code path has never run.
- **Dev login** (`POST /api/dev-login`, creates a session for `dev@example.test`) exists because no OAuth creds. It requires `DEV_LOGIN=1` and is hard-disabled when `NODE_ENV=production` (unit-tested). Remove or keep gated before deploy.
- **Email magic link not built** (default said "for dev"); needs an SMTP provider decision.
- **Cookie name**: `__Host-authjs.session-token` only in production (needs HTTPS); dev uses `authjs.session-token`. The `__Host-` path was **not exercised**, only the dev name.
- **Production needs `AUTH_URL`** (Auth.js rejects unknown hosts); host is trusted only when it is set. Logged error `UntrustedHost` seen once when it was missing — expected.
- **CSRF**: Auth.js's built-in protection and the same-origin check on dev-login only. The planned custom `X-CSRF` token for API POSTs is deferred to M2 when real API routes exist.
- **Next.js `style-src-attr 'unsafe-inline'`** is a deliberate, narrow relaxation (see bug 2).
- **a11y**: axe passes, but axe finds only a subset of WCAG issues; no manual screen-reader or keyboard-only audit yet (planned M6). Palette contrast is now covered by axe color-contrast rules on those two pages.
- **next-auth v5 is a beta** (5.0.0-beta.32) — the only v5 line available; pin carefully.
- **Prisma 6** chosen over 7 (7 changes config/driver model; not evaluated). **Node 24 locally vs 22 in CI.**
- **CI still unexecuted** (no git repo/remote); CI does not yet run Prisma migrations or e2e.
- Docker Desktop was started by me and Postgres container `slefclaude-postgres-1` is **left running**; Playwright browsers (~330 MB) were downloaded.
- Not done from the plan: shadcn component CLI (added none yet).

# M0 Report — Repo, CI, design tokens

Date: 2026-11-06 · Status: **implemented, awaiting go-ahead for M1**

## Results (commands actually run)
| Check | Result |
|---|---|
| `pnpm typecheck` | pass |
| `pnpm lint` | pass (one initial warning fixed) |
| `pnpm format:check` | pass |
| `pnpm test` | pass — 2 files, 5 tests |
| `pnpm build` (Next 16) | pass — routes `/`, `/new` |
| Security headers on `next start` (curl) | nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, HSTS present; `X-Powered-By` absent |
| `docker compose config` | valid (services **not started**, images not pulled) |

## Not verified / deviations
- **Playwright e2e not run**: spec and config exist, but browsers not installed (~150 MB download; needs your OK). Headers were checked with curl instead.
- **CI workflow not executed**: no git repo / no remote yet (`git init` not run). gitleaks and `pnpm audit` have never run.
- **shadcn/ui CLI not run**: added `cn`, `class-variance-authority`, `lucide-react`; shadcn components will be added per-need from M1 (its CLI is interactive and fetches from network).
- **Pins**: eslint 9 (eslint-config-next peer range excludes 10) and TypeScript 5.9 (7.x just released; Next support not checked). Node installed is 24, project `engines >=22`, CI uses 22 — local/CI mismatch.
- **Contrast of palette unmeasured** (see docs/design/tokens.md); axe check planned M1.
- **Logo** is a quick original SVG placeholder; owner should review.
- Dependency versions came from "latest" at install time (e.g. Next 16.4, React 19.3, Vitest 5.1, Zod 4.6); I did not review their changelogs.

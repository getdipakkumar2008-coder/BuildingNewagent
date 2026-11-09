# Implementation Plan (M0–M7)

Rule: after each milestone run typecheck/lint/tests, report results honestly (failures included), list deviations, **wait for go-ahead**. PRs small; conventional commits.

## M0 — Repo, CI, design tokens
- **Tasks:** init Next.js+TS+Tailwind+shadcn; ESLint/Prettier/tsc strict; Vitest + Playwright skeleton; docker-compose (Postgres, Redis, MinIO); env schema (zod) + `.env.example`; GitHub Actions (typecheck, lint, unit, gitleaks, audit); design tokens + asset provenance register; name/logo (original, simple wordmark).
- **Risks:** accidental likeness to a commercial UI → design review against clean-room policy.
- **DoD:** CI green on empty app; `docker compose up` works; tokens documented; no secrets in repo.
- **Tests:** smoke render test; env validation test; CI secret-scan passes.

## M1 — Auth + shell layout + /new
- **Tasks:** Auth.js + Prisma schema (users/accounts/sessions); protected layout; sidebar (empty), top bar, `/new` empty state with focused composer; theme (light/dark); responsive; security headers + CSP.
- **Risks:** OAuth app setup (user action); CSP breaking dev tooling.
- **DoD:** sign-in → `/new`; unauthenticated redirect; axe clean; headers verified.
- **Tests:** e2e login (mock provider); a11y (axe); header test; session cookie flags test.

## M2 — Streaming chat + persistence
- **Tasks:** conversations/messages tables; repository layer w/ userId scoping; `/conversations/{id}/messages` SSE; Anthropic SDK streaming; model picker (allow-list); stop; regenerate/edit branching; rate limit + quotas; error mapping.
- **Risks:** proxy buffering; orphaned `streaming` rows; cost.
- **DoD:** tokens stream; stop saves partial; reload shows history; 429 UX.
- **Tests:** unit (event mapper, repo scoping); integration with **fake Anthropic server**; IDOR tests; e2e stream/stop; one opt-in live smoke test (needs key).

## M3 — Markdown/code/artifacts
- **Tasks:** sanitized incremental markdown; code blocks w/ copy + highlighting; artifact detection → side panel; sandboxed iframe (no same-origin); keyboard shortcuts.
- **Risks:** XSS; perf of re-render on each delta.
- **DoD:** XSS corpus blocked; artifact can't read parent storage/cookies; 60 fps on long reply (manual profile).
- **Tests:** XSS payload suite; iframe sandbox attribute test; render perf test; snapshot of markdown cases.

## M4 — Upload + history/search
- **Tasks:** attachments (validation, storage, extraction worker); attach to messages → model content blocks; history list, rename, delete (hard), FTS search.
- **Risks:** malicious files; large PDFs; token blowup.
- **DoD:** disallowed types/size rejected; delete removes storage objects; search returns only own data.
- **Tests:** MIME/magic-byte tests; polyglot fixture; cross-user access denied; search tests.

## M5 — Deep research + citations + progress UI
- **Tasks:** BullMQ worker; `SearchProvider` + adapter; SSRF-guarded fetcher; plan/search/read/synthesize pipeline; budgets; cancel; sources tables; citation validator; progress UI (steps, sources list, cancel); resume via Last-Event-ID.
- **Risks:** injection; search ToS/cost; hallucinated citations; long jobs.
- **DoD:** report where every `[n]` maps to a stored source and quote check passes; cancel works; budget enforced; restart mid-run resumes or fails cleanly.
- **Tests:** pipeline with fake search + fake LLM; SSRF suite (private IPs, redirects, DNS rebinding case); injection fixture page that tries to exfil/override; citation-validator unit tests; e2e research flow.

## M6 — Hardening
- **Tasks:** a11y audit (keyboard, SR, contrast, reduced motion); perf budget; threat checklist execution; dependency audit; rate-limit tuning; load test SSE; error pages.
- **DoD:** security checklist all tested; axe clean; Lighthouse ≥90 on `/new`; no high/critical audit findings.
- **Tests:** full e2e; k6 smoke; security regression suite.

## M7 — Deploy + observability
- **Tasks:** container image; hosting target (Q7); migrations pipeline; secrets management; pino + OTel; health/readiness; backups; runbook; kill-switch.
- **DoD:** deployed staging; dashboards/alerts for error rate, TTFT, queue depth, cost; restore drill documented.
- **Tests:** post-deploy smoke; migration dry-run; rollback rehearsal.

## Cross-cutting
- Tests that call real Anthropic/search are opt-in (env flag) so CI needs no keys.
- Each milestone updates docs + asset register + ADR status (Proposed → Accepted).

Open questions: Q7 (hosting) · Next step: user approves plan → start M0.

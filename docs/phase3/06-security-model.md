# Security Model

## Assets
User accounts & conversations; uploaded files; Anthropic and search API keys; research-job compute budget.

## Trust boundaries
Browser ⇄ Next.js server ⇄ {Postgres, Redis, object storage, Anthropic API, search provider, **arbitrary web pages (untrusted)**}.

## Controls
| Area | Control |
|---|---|
| AuthN | Auth.js with OAuth (Google/GitHub) and/or email magic link; DB sessions; `__Host-` cookie, `HttpOnly; Secure; SameSite=Lax`; session rotation on login |
| AuthZ | Every query scoped by `user_id` in a repository layer; IDOR tests per endpoint; deny by default |
| CSRF | SameSite=Lax cookie + same-origin `Origin` check + required custom header `X-Requested-With: deepresearchai` on every state-changing API call (browsers cannot send a custom header cross-origin without a CORS preflight, and we send no CORS headers). **As built in M2; replaces the earlier double-submit-token idea.** |
| XSS | React escaping; markdown → sanitized (no raw HTML, `rehype-sanitize` allowlist); strict CSP with nonces (`default-src 'self'`; no `unsafe-inline` scripts); artifacts rendered in `<iframe sandbox>` **without** `allow-same-origin`, served from separate origin when deployed; links `rel="noopener noreferrer"` |
| Uploads | allow-list MIME + magic-byte sniff; size caps (default 20 MB, 10 files); random storage keys; served only via authenticated route with `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`; optional AV scan hook; text extraction in sandboxed worker |
| Rate limits | Redis token bucket per user+IP: chat starts, uploads, research runs; daily token & research quotas (`usage_counters`); 429 + `Retry-After` |
| Secrets | env vars only; validated at boot (zod); never `NEXT_PUBLIC_`; CI secret scan (gitleaks); logs redact `authorization`, cookies, keys |
| Prompt injection | Fetched pages and uploaded files are **data, not instructions**: wrapped in delimited untrusted-content blocks; system prompt states they may contain hostile instructions; research agent has **no write tools** and a fixed tool allow-list (search, fetch); fetch tool output truncated and stripped of scripts; model output never executed; citations must reference stored `sources`; no secrets or user PII in agent context; human-visible tool/action log |
| SSRF (fetch tool) | Resolve DNS then block private/loopback/link-local/metadata ranges (re-check after redirects), http/https only, ports 80/443, size/time caps, no cookies forwarded, egress through a dedicated fetcher with deny-list |
| Abuse/cost | Per-run budgets (searches, tokens, wall time); queue concurrency caps; kill switch env flag |
| Privacy | No training use; delete = hard delete; export endpoint (post-v1); IPs hashed in audit log; data-processing note in settings |
| Supply chain | lockfile, Dependabot/Renovate, `npm audit` in CI, pinned Actions |
| Headers | HSTS, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `frame-ancestors 'none'` |
| Logging | structured, request-id, no message content at info level |

## Threat checklist (STRIDE-lite, tested in M6)
IDOR on conversations/attachments · stored XSS via markdown/artifact · SSRF via fetch tool · injection via web page causing exfil (no tools to exfil; markdown image/link auto-load disabled for model output to untrusted domains) · session fixation · upload polyglots · cost-exhaustion DoS · SSE connection exhaustion.

Open questions: Q6 (auth providers) · Next step: architecture + ADRs.

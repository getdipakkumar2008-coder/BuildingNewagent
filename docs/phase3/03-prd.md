# PRD — DeepResearchAI

## 1. Summary
DeepResearchAI is an original web app for AI chat and cited deep research. Entry route `/new`. Independent product: own name, logo, palette, copy. Not affiliated with Anthropic; uses the public Anthropic API.

## 2. Goals
- G1 Fast, accessible streaming chat with persisted history.
- G2 Deep-research mode producing a cited report with visible progress.
- G3 Safe by default: auth, CSRF, rate limits, prompt-injection handling, no secrets in client.
- G4 Small reviewable codebase, milestone-gated.

## 3. Non-goals (v1)
Mobile native apps · voice · image generation · team/org workspaces & billing · public sharing links · plugin marketplace · multi-provider model routing · offline mode · real-time collaboration · self-hosted search index · training on user data.

## 4. Personas
- **Asker** — quick questions, wants fast streaming and good code/markdown.
- **Researcher** — wants a sourced report on a topic and to inspect sources.

## 5. User stories (acceptance in Given/When/Then, abbreviated)
| ID | Story | Acceptance |
|---|---|---|
| US-1 | As a visitor I sign in so my chats are private | Unauth'd `/new` redirects to sign-in; after login lands on `/new` |
| US-2 | I open `/new` and see an empty state with composer | Composer focused; no conversation row created until first send |
| US-3 | I send a message and see tokens stream | First token rendered <1 s after server's first event (local); aria-live polite |
| US-4 | I stop generation | Stream aborts ≤500 ms; partial message saved with `status=stopped` |
| US-5 | I regenerate / edit a message | New assistant branch created; previous kept |
| US-6 | I pick a model | Choice persisted per conversation; only allow-listed IDs |
| US-7 | I see markdown, code with copy button | Sanitized render; no raw HTML execution |
| US-8 | I open generated code/doc in a side panel (artifact) | Rendered in sandboxed iframe (no same-origin) or text view |
| US-9 | I attach files (PDF, text, image) | Type/size validated server-side; scanned for allowed MIME; stored privately |
| US-10 | I browse/search/rename/delete history | Full-text search over own messages; delete is hard-delete incl. attachments |
| US-11 | I toggle Research and enter a question | Plan shown; steps update live; can cancel |
| US-12 | I get a report with inline numbered citations | Every cited claim links to a stored source with URL, title, retrieved_at |
| US-13 | I use keyboard shortcuts | Documented set; no conflicts with screen readers |
| US-14 | I use dark mode & small screens | Respects `prefers-color-scheme`; usable at 360 px |
| US-15 | I'm rate limited gracefully | 429 with `Retry-After`; UI explains |

## 5a. Non-functional
a11y WCAG 2.2 AA · p95 API latency (non-LLM) <300 ms · Lighthouse perf ≥90 on `/new` · research job survives server restart · ≥80% unit coverage on core logic (target, not a vanity gate).

## 6. Success metrics
Time-to-first-token; research completion rate; % report claims with ≥1 source; zero secrets in client bundle (CI check).

## 7. Risks
Cost runaway (token budgets, per-user caps) · prompt injection via fetched pages · search-provider ToS/cost · hallucinated citations (mitigate: citations only from stored sources; verify quotes) · likeness to a commercial product (mitigate: own design tokens, design review).

Open questions: Q1, Q4–Q8 · Next step: data model & API.

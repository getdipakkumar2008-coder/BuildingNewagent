# Open Questions (decisions that are yours)

Defaults are what I'll use if you say "go with defaults".

| # | Question | Default |
|---|---|---|
| Q1 | Product wording/branding: OK to use "DeepResearchAI" as the visible name, with an original wordmark I design? | Yes |
| Q2 | Phase 2 targets: which open-source chat UIs may I study (Open WebUI, LibreChat)? Note licenses differ — I read for behavior only, never copy code. Install/run via Docker OK? | LibreChat + Open WebUI, read-only study, run locally via Docker only with your OK |
| Q3 | REA MCP server failed to connect this session (CONNECT_TIMEOUT). Retry/fix MCP, or use `npx -y rea-agents@latest` CLI fallback (downloads a package — needs your OK)? | CLI fallback, after your OK |
| Q4 | Search provider for research agent (Brave, Tavily, Exa, self-hosted SearXNG)? Needs your API key/account. | Brave Search API behind `SearchProvider` |
| Q5 | Data retention default? | Keep until user deletes |
| Q6 | Auth providers: Google, GitHub, email magic link? Needs OAuth app creds from you. | GitHub OAuth + email magic link for dev |
| Q7 | Hosting target for M7 (Vercel can't run the worker; options: Fly.io, Railway, AWS ECS — you have an AWS folder)? | Docker on AWS (ECS/Fargate) or Fly.io |
| Q8 | Anthropic API key available for dev/live tests? Budget cap? | Fake server for CI; you supply key via `.env` |
| Q9 | Package manager / Node version? | pnpm, Node 22 LTS |

Also noted for transparency:
- The prompt mentions claude.ai/new as inspiration; I will **not** analyze claude.ai's private frontend or endpoints (see clean-room policy).
- Model IDs come from the master prompt; verify against current Anthropic docs at M2.

## Resolution (2026-11-06)
User said "go with defaults" for Q1–Q9. Notes: Q4/Q6/Q8 still need real API keys/OAuth credentials from the user before M2/M1/M5; Q2 recon done read-only (no Docker run, no REA download); Q3 CLI fallback not used (not needed for OSS source reading). Phase 4 plan approval is NOT yet given.

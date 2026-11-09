# DeepResearchAI — Documentation Index

Status (2026-11-09): **Implementation in progress. M0–M4 are built and reported; M5 (deep research) awaits your go-ahead and needs a search-provider key (Q4) and an Anthropic key (Q8).**
The plan was approved on 2026-11-06. Real-service checks (live Anthropic API, GitHub OAuth, CI) are still outstanding — see the milestone reports.

Source of truth for scope: `../MASTER_PROMPT.md`.

| Phase | Document                                                    | Status                                                                                                                                                                                                                                                |
| ----- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | [CLEAN_ROOM_POLICY.md](00-clean-room-policy.md)             | Done                                                                                                                                                                                                                                                  |
| 1     | [REA analysis + Method Card](phase1/01-rea-analysis.md)     | Done (read from a shallow clone of morluto/rea, v6.8.0 plugin manifest). A shorter second pass is in the root file `PHASE1_REA_ANALYSIS.md` (REA 6.7.0, the version installed locally)                                                                |
| 2     | [Recon protocol + evidence log](phase2/02-evidence-log.md)  | Evidence log v1 (15 observations, 5 open assumptions). A second pass (Open WebUI, LibreChat, Anthropic streaming and web-search docs) is in the root file `PHASE2_FEATURE_RECON.md`; its findings have not yet been merged into the v1 log          |
| 3     | [PRD, stories, non-goals](phase3/03-prd.md)                 | Draft                                                                                                                                                                                                                                                 |
| 3     | [Data model](phase3/04-data-model.md)                       | Draft                                                                                                                                                                                                                                                 |
| 3     | [API contract (OpenAPI)](phase3/openapi.yaml)               | Draft                                                                                                                                                                                                                                                 |
| 3     | [Streaming protocol](phase3/05-streaming-protocol.md)       | Draft                                                                                                                                                                                                                                                 |
| 3     | [Security model](phase3/06-security-model.md)               | Draft                                                                                                                                                                                                                                                 |
| 3     | [Architecture + stack](phase3/07-architecture.md)           | Draft                                                                                                                                                                                                                                                 |
| 3     | [ADRs](phase3/adr/) (ADR-001 … ADR-008)                     | Draft                                                                                                                                                                                                                                                 |
| 4     | [Implementation plan M0–M7](phase4/08-implementation-plan.md) | Approved 2026-11-06 · [M0](phase4/m0-report.md) · [M1](phase4/m1-report.md) · [M2](phase4/m2-report.md) · [M3](phase4/m3-report.md) (re-verified 2026-11-09; 60 fps profile not done) · [M4](phase4/m4-report.md) (attachments, history rename/delete/search; no extraction worker, local-disk storage)                                                                |
| —     | [Open questions](09-open-questions.md)                      | Q1–Q9 resolved with defaults on 2026-11-06; Q4 (search provider key), Q6 (OAuth credentials) and Q8 (Anthropic key + spending cap) still need real credentials from you                                                                              |

## Per-phase output format (from the master prompt)

Each document ends with: summary, artifacts/files, open questions, next step.

## Gate

Each milestone ends with a report and waits for your go-ahead before the next one starts.

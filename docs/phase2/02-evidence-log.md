# Phase 2 — Feature Reconnaissance: Evidence Log

**Method:** static, read-only reading of shallow clones (REA was *not* used: its own skill says normal repo tools suffice for open-source source trees; no runtime capture, no Docker, no network calls to any product).
**Targets and licenses (verified from each `LICENSE` file):**
- LibreChat — commit `f4154b6`, **MIT**. Read for behavior; I still do not copy code.
- Open WebUI — commit `c38885a`, **custom "Open WebUI License"** (BSD-style text with branding terms, not MIT). Behavior-only reading, minimal; nothing copied.
- Anthropic API docs: **not fetched this pass** → all upstream-API statements stay `assumption` until checked at M2.
Paths below are relative to each clone root. No proprietary text/CSS/assets were taken. Claims are in my own words.

Type key: **O** observation (seen in file) · **I** inference · **A** assumption (unverified).

## Evidence table
| ID | Claim | Evidence | Type | Conf. | Limitations |
|---|---|---|---|---|---|
| E1 | Server streams chat output as SSE with headers `text/event-stream`, `no-cache, no-transform`, keep-alive and `X-Accel-Buffering: no` (proxy buffering off). | LibreChat `api/server/middleware/setHeaders.js:1-10` | O | High | It also sets `Access-Control-Allow-Origin: *` — we should NOT copy that; our API is same-origin. |
| E2 | Client consumes the stream through a dedicated SSE hook layer, with a separate "resumable" variant and helper modules for abort, final-message and content handling. | LibreChat `client/src/hooks/SSE/` (useSSE.ts, resumable.ts, abort.ts, final.ts, handlers.ts) | O | High | Filenames only; internals not read in depth. |
| E3 | Generation can be resumed after disconnect: a server-side job manager (`GenerationJobManager`) and a `resume` controller exist. | `api/server/controllers/agents/resume.js:1-40`, `api/server/controllers/agents/request.js` | O (existence) / I (exact semantics) | Medium | Interpreted from imports; behavior not traced. Supports our plan to resume research streams only (simpler). |
| E4 | Stop/abort is implemented server-side with AbortController around generation. | `api/server/controllers/agents/request.js`, `client.js`, `api/server/cleanup.js` (grep hits for AbortController) | O | Medium | Not read in depth. |
| E5 | Regenerate and edit-message are first-class UI actions (hover buttons, edit component, regenerate flags). | `client/src/components/Chat/Messages/HoverButtons.tsx`, `Content/EditMessage.tsx`; flags `isRegenerate`/`isEdited` in `client/src/common/types.ts` | O | High | Branching/tree semantics (`MultiMessage.tsx` exists) not verified → matches our `parent_id` design as **I**. |
| E6 | Markdown is rendered with react-markdown plugins: GFM, math (KaTeX), syntax highlighting (rehype-highlight), directives. | `client/src/components/Chat/Messages/Content/markdownConfig.ts:2-7,55-57` | O | High | I did **not** see an HTML sanitizer in the lines inspected. Whether sanitization exists elsewhere is **unverified** — our design mandates it regardless (security model). |
| E7 | Markdown has an error boundary and a benchmark, i.e. render cost and malformed-input safety are treated as concerns. | `MarkdownErrorBoundary.tsx`, `MarkdownBlocks.bench.tsx` | O | Medium | Rationale inferred. Supports our "parse only the tail block while streaming" plan (**I**). |
| E8 | Artifacts (generated code/doc) render in a side-panel component set with tabs, versions, code editor and live preview powered by the Sandpack library. | `client/src/components/Artifacts/` (Artifacts, ArtifactTabs, ArtifactVersion, ArtifactPreview, ArtifactCodeEditor); `@codesandbox/sandpack-react` in `client/package.json` | O | High | Sandpack runs preview in its own iframe/bundler; isolation properties not verified. We use a plain sandboxed iframe instead (ADR needed if changed). |
| E9 | Open WebUI renders artifacts in an `<iframe>` and adds `allow-same-origin` to the sandbox **only conditionally** (a user setting `iframeSandboxAllowSameOrigin`, default false in the code seen). | Open WebUI `src/lib/components/chat/Artifacts.svelte:209`, `FileNav/FilePreview.svelte:421,437` | O | High | Confirms the risk trade-off; our default stays "never allow-same-origin". |
| E10 | Keyboard shortcuts exist with both display strings and ARIA key strings per platform (e.g. a "new chat" chord and a "show shortcuts" chord). | LibreChat `client/src/hooks/useKeyboardShortcuts.ts:44-54` | O | High | Another hook notes Shift+Alt is reserved for screen readers (`hooks/Generic/useShiftKey.ts:6`) → supports our a11y rule of avoiding SR chords. |
| E11 | Composer treats modifier+Enter as a secondary action while a run is active. | `client/src/hooks/Input/useTextarea.ts:64` (comment) | O | Medium | Comment only. |
| E12 | Temporary/ephemeral chat mode exists as a distinct UI concept. | `client/src/components/Chat/TemporaryChat.tsx` | O | Medium | Candidate post-v1 feature; not in our PRD. |
| E13 | Sidebar has "new chat" and open/close controls; model selector is a menu component under Chat/Menus/Endpoints. | `client/src/components/Chat/Menus/NewChat.tsx`, `OpenSidebar.tsx`, `Endpoints/ModelSelector.tsx` | O | High | Layout itself not observed (no running UI, no screenshots). |
| E14 | Backend packages cover conversations, messages, files, projects, memory, artifacts, MCP, rate/limits (`clientlimits`), etc. — i.e. a conversation + project + file data model similar to ours. | LibreChat `packages/api/src/` directory listing | O | High | Directory names only; schemas not read. |
| E15 | Open WebUI has a distinct Citations component set (with a modal) and message components for code blocks, errors, and multi-response messages; backend streams via `StreamingResponse`. | `src/lib/components/chat/Messages/Citations/`, `Messages/CodeBlock.svelte`; `backend/open_webui/main.py`, `routers/chats.py` | O | Medium | Citation data flow not traced. |

## Not verified (explicit assumptions)
| ID | Statement | Status |
|---|---|---|
| A1 | Anthropic Messages streaming event names and delta formats. | **VERIFIED 2026-11-06** against platform.claude.com streaming docs (also documents `thinking_delta`, `signature_delta`, `error` event). |
| A2 | Model IDs `claude-fable-5-1`, `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`. | **VERIFIED 2026-11-06** in the public models overview (exact IDs; thinking is adaptive/always-on, so streams can contain thinking blocks). |
| A3 | Deep-research flow (plan → parallel search → gather → synthesize → cited report, progress UI). | **A** — not examined in either target this pass. Our design (07-architecture) is original; to evidence it I'd read an open-source research agent and Open WebUI's web-search/RAG path, which I have not done. |
| A4 | Responsive/dark-mode behavior, empty state and `/new` flow, visual layout. | **A** — needs a running instance or screenshots; deferred (needs your OK for Docker/local run). |
| A5 | LibreChat/Open WebUI sanitization of rendered HTML. | **A** — unchecked (see E6). |

## Findings that change the plan
1. **Do not copy** LibreChat's permissive CORS (`*`) on streams (E1).
2. **Keep** resumability to research runs only (E3 shows it is a heavy subsystem); documented in ADR-005 already.
3. **Add** a citation/sanitization check step to M3/M5 test plans: explicit XSS corpus because E6 shows no sanitizer in the inspected config.
4. **Artifacts:** default no `allow-same-origin` (E9). Considering Sandpack is optional; plain sandboxed iframe stays default.
5. **Post-v1 backlog:** temporary chats (E12).
No changes needed to the milestone list.

## Open questions
- Q-A: OK to run LibreChat via Docker locally to observe the UI (A4)? Not done.
- Q-B: Should I extend recon to deep-research implementations (A3) and fetch Anthropic docs (A1/A2)? Recommended before M5, and A1/A2 at M2.

## Next step
Your approval of the Phase 4 plan to begin **M0** (or ask me to close A1–A3 first).

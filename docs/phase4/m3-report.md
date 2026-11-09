# M3 report - Markdown, code blocks, artifacts, shortcuts

Date: 2026-11-09 · Status: **implemented and re-verified; awaiting go-ahead for M4**

This report was written after a code review of the M3 code and a fix pass. M3 was built earlier without a report;
the build details below are taken from the code and tests as they exist now, not from a build log.

## Results (commands actually run, 2026-11-09, final state)

| Check                                                                          | Result                                                                                                                                           |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tsc --noEmit`                                                                 | pass                                                                                                                                             |
| `eslint .`                                                                     | pass (no output)                                                                                                                                 |
| `prettier --check .`                                                           | pass (after formatting three root-level notes files I had added)                                                                                 |
| `vitest run` (unit)                                                            | pass - 10 files, 106 tests                                                                                                                       |
| `vitest run -c vitest.integration.config.ts` (real Postgres test DB and Redis) | pass - 3 files, 29 tests                                                                                                                         |
| `playwright test` (Chromium, dev server + fake Anthropic)                      | pass - 38 tests (3.1 min)                                                                                                                        |
| `pnpm audit --prod --audit-level=high`                                         | no known vulnerabilities                                                                                                                         |
| `next build`                                                                   | **not run in this pass** (last confirmed in the M2 report). Production-mode browser check (`next start`) **not repeated** after the review fixes |

## What M3 contains (verified present in code/tests)

- **Markdown:** incremental rendering. `src/lib/markdown-blocks.ts` splits streaming text into blocks; finished
  blocks are memoized (`Block = memo(...)` in `src/components/chat/markdown.tsx`) and only the tail re-renders.
  Headings start at h3 (page has an h1, messages have h2). Links get hardened attributes; GFM tables, lists,
  quotes, autolinks render. An unclosed fence mid-stream renders as a code block.
- **Code blocks:** labelled, syntax highlighted, copyable (e2e "code blocks are labelled, syntax highlighted and
  copyable").
- **Artifacts:** complete ```html / ```svg fences become cards; the side panel has Preview and Code tabs. The
  preview is an iframe pointing at `/api/artifacts/<messageId>/<ordinal>`, sandboxed `allow-scripts` without
  `allow-same-origin`. The server re-extracts the artifact from stored message text (the browser never supplies
  markup) and serves it with a sandbox CSP (`default-src 'none'`, `connect-src 'none'`, `frame-ancestors 'self'`),
  `nosniff`, `no-store`. Owner-only access.
- **Shortcuts:** `?` opens the list and Esc closes it, `/` focuses the composer, Ctrl+Shift+O starts a new chat;
  there is also a shortcuts button for mouse users (`src/components/shell/shortcuts.tsx`).

## Plan items for M3 - status

| Plan item (08-implementation-plan.md)                                    | Status                | Evidence                                                                                                                                                                  |
| ------------------------------------------------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sanitized incremental markdown                                           | Done                  | `tests/unit/markdown.test.tsx` "incremental rendering" block (each finished block rendered once; total renders linear, not quadratic); e2e markdown tests                 |
| Code blocks with copy + highlighting                                     | Done                  | e2e "code blocks are labelled, syntax highlighted and copyable"                                                                                                           |
| Artifact detection -> side panel                                         | Done                  | `tests/unit/artifacts.test.ts`; e2e artifacts group (open, code tab, svg, phone overlay)                                                                                  |
| Sandboxed iframe, no same-origin                                         | Done                  | e2e "html artifact opens in a sandboxed preview that cannot reach the app", "opening the artifact URL directly is still sandboxed", header test; `ARTIFACT_IFRAME_SANDBOX` |
| Keyboard shortcuts                                                       | Done (basic set)      | e2e "keyboard shortcuts" (2 tests). Shortcuts are fixed, not user-configurable                                                                                            |
| DoD: XSS corpus blocked                                                  | Done for the corpus   | e2e "hostile model output (XSS)": script, handlers, javascript: links, images, iframes inert, also after reload from storage; unit scan of the rendered DOM              |
| DoD: artifact cannot read parent storage/cookies                         | Done                  | Opaque origin (no allow-same-origin) + CSP; e2e sandbox tests. Not independently pen-tested                                                                               |
| DoD: 60 fps on a long reply (manual profile)                             | **Not done**          | No browser performance profile was captured. Only the render-count tests exist, which show linear growth, not frame rate                                                  |
| Tests: "snapshot of markdown cases"                                      | **Different form**    | No snapshot tests; behavior is asserted by explicit unit and e2e assertions instead                                                                                       |
| Tests: iframe sandbox attribute test                                     | Done                  | via e2e and constant `ARTIFACT_IFRAME_SANDBOX = "allow-scripts"`                                                                                                          |

## Review fixes applied after M3 (this pass)

A `/code-review` of the M3 files returned 9 findings; 8 fixed, 1 deliberately left:

1. Fence open rule in `markdown-blocks.ts` and `artifacts.ts` now follows CommonMark identically (backtick info
   strings cannot contain a backtick; tilde info strings can). Regression tests added.
2. Open artifact is re-derived from the current branch each render (no stale snapshot after branch switch or edit);
   cards only for `complete` messages.
3. `dev-login`: `Origin: null` or unparsable origin -> 403 (was a 500).
4. Artifact size cap measures UTF-8 bytes. Oversize artifacts are still skipped silently.
5. SVG artifacts: XML prolog and DOCTYPE removed before embedding.
6. Artifact route errors for the iframe are a readable HTML page (same sandbox CSP); 401 stays JSON.
7. Copy button timer cleared on unmount and repeat clicks.
8. **Left as is:** a fence indented 4+ spaces inside a list item gets no artifact card (it still renders as code).
   Both parsers agree on this.

New tests: 4 unit tests (fence rules, UTF-8 cap, SVG prolog). The error-page route change and the `Origin: null`
change have **no dedicated test yet**. They were covered only by the existing suites staying green.

## Deviations / not verified

- No frame-rate profile (see above).
- Real Anthropic API still never called; GitHub OAuth still untested (see M2 report).
- CI is still unexecuted (no git repo).
- The production build and a production-mode browser run were not repeated after the fixes.
- Playwright run used the dev server, not a production build.
- Shortcuts are not configurable and do not cover every action in the PRD (not checked line by line).
- Docker containers `slefclaude-postgres-1` and `slefclaude-redis-1` are still running on this machine.

## Open questions

- Keep fixed shortcuts for now, or add a settings screen for rebinding (would belong with M4/M6)?
- Add tests for the artifact error page and the `Origin: null` case before M4?

## Next step

User go-ahead for M4 (attachments, history list/rename/delete, search).

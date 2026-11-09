# M4 report - Attachments, history management, search

Date: 2026-11-09 · Status: **implemented; awaiting go-ahead for M5**

## Results (commands actually run, final state)

| Check                                                                       | Result                                                                                                          |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `tsc --noEmit` / `eslint .` / `prettier --check .`                          | pass                                                                                                            |
| `vitest run` (unit)                                                         | pass - 11 files, 117 tests (11 new for uploads)                                                                 |
| `vitest run -c vitest.integration.config.ts` (real Postgres + Redis + fake) | pass - 5 files, 44 tests (15 new: attachments 9, search 6)                                                      |
| `playwright test` (Chromium, dev server + fake Anthropic)                   | pass - 51 tests (3.0 min)                                                                                       |
| `pnpm audit --prod --audit-level=high`                                      | no known vulnerabilities                                                                                        |
| `pnpm build`                                                                | pass (new routes `/api/attachments`, `/api/attachments/[id]` present)                                           |

**E2E:** the first full run had 50 passing and 1 failing (see "Bugs found"); after the fix, a second full run passed:
**51 passed** (38 existing + 13 new: history 5, attachments 8).

## What was built

### History management and search

- `GET /api/conversations?q=` - Postgres full-text search over the caller's own conversation titles and message text
  (word-prefix match, up to 8 letter/digit tokens, query reaches SQL only as a bound parameter of sanitized tokens).
  Scoped by `user_id` in SQL. Archived chats excluded.
- Sidebar (`components/shell/history-list.tsx`): debounced search box, inline rename (Enter saves, Esc cancels),
  two-step inline delete (no browser dialogs), live-region status messages, navigates to `/new` if the open chat
  is deleted. Rename/delete use the pre-existing, already-tested PATCH/DELETE APIs.

### Attachments

- **Types accepted:** PNG, JPEG, GIF, WebP, PDF (by magic bytes), plain-text files (`.txt .md .markdown .csv .json .log`, strict UTF-8, no control characters).
  Everything else is rejected, including SVG and HTML. The stored MIME comes from the bytes, never from the client or the extension.
  A name that claims text but whose bytes are binary is rejected as `mismatched_type`.
- **Limits:** images 5 MB, PDFs 20 MB, text 1 MB, 10 files per message, 30 unsent uploads per user, 30 uploads/minute/user,
  unsent uploads older than 24 h are removed on that user's next upload.
- **Storage:** `src/server/storage` interface with a local-disk driver (`UPLOAD_DIR`, default `.data/uploads`, mode 0600, random keys,
  key format validated before any path is built). Bytes are only reachable through the owner-checked route.
- **Download:** `GET /api/attachments/{id}` is owner-only (404 for other users, 401 anonymous), `Content-Disposition: attachment`,
  `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox`, `no-store`.
- **Sending:** `attachment_ids` on the send route. Linking is a single transaction with the new message; any missing, foreign,
  duplicate or already-sent id rolls the whole message back (`422 attachment_unavailable`).
- **To the model:** images and PDFs are sent as native `image` / `document` base64 blocks; text files are inlined inside an
  `<attached_file ... trust="untrusted-user-data">` wrapper (closing tag in the file body is neutralised) and the system prompt tells the model
  that attachments are data, not instructions (ADR-008). Attachments of earlier turns on the active branch are included;
  a 24 MB per-request attachment budget keeps the newest and replaces older ones with a short note.
- **Delete:** deleting a conversation removes its attachment rows (cascade) and then the stored files. Removing an unsent chip deletes the upload.
- **UI:** attach button, file chips with uploading/ready/error states and remove buttons, attachments shown on sent messages as download links.
- **Proxy:** `/api/attachments` is excluded from `src/proxy.ts`: Next's proxy buffers request bodies and truncates them at 10 MB by default
  (confirmed in the bundled docs), which would corrupt large PDFs. A 15 MB PDF round-trip is covered by an e2e test.

## Bugs found by tests and fixed during M4

1. **Duplicate attachment ids were accepted** (linked once, no error). Found by the new ownership integration test. Now rejected.
2. **Existing e2e test broke** because the new sidebar buttons ("Rename chat which model", "Delete chat which model") matched the
   loose `getByLabel("Model")` selector. Test made exact; real users are not affected.
3. ESLint `set-state-in-effect` on the first sidebar draft; state updates moved into event handlers.

## Plan items for M4 - status

| Plan item                                                       | Status                | Notes                                                                                                                  |
| --------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Attachments: validation, storage, extraction worker             | **Partly / changed**  | Validation and storage done. **No extraction worker**: PDFs and images go to the model natively, text is inlined       |
| Attach to messages -> model content blocks                      | Done                  | Integration tests inspect the exact request the fake server received                                                   |
| History list, rename, delete (hard), FTS search                 | Done                  | Delete also removes stored files                                                                                       |
| DoD: disallowed types/size rejected                             | Done                  | unit + e2e                                                                                                             |
| DoD: delete removes storage objects                             | Done (local driver)   | e2e counts files on disk before/after                                                                                  |
| DoD: search returns only own data                               | Done                  | integration + e2e (second user)                                                                                        |
| Tests: MIME/magic-byte, polyglot fixture, cross-user, search    | Done                  | PNG-as-.txt, binary-as-.txt, PDF-as-.md, html/svg/exe renamed                                                          |

## Deviations / not verified

- **Real Anthropic API still never called.** The `image`/`document` block shapes follow the public docs and the SDK types, and
  the SDK compiles them, but only a fake server has received them. A live smoke test (needs your key) is the open item.
- **Storage is local disk, not MinIO/S3** as the architecture doc says. The interface is there for an S3 driver. Local disk
  only works for a single instance with a persistent volume. The `minio` service in `docker-compose.yml` is unused.
- **No virus/malware scanning.** Mitigations: strict allow-list, bytes-based typing, download-only serving with sandbox CSP, never executed.
- **Not checked against upstream limits:** PDF page count (docs: 100 pages, or 600 with a 1M-token context) and image dimensions (8000x8000 px).
  Such files pass our checks and may fail upstream with a generic "request could not be processed" error. Upstream size limits (128 MB request,
  10 MB per base64 image on the first-party API per the docs) are looser than our caps; other platforms (e.g. Bedrock 5 MB base64 per image) are stricter.
- **Edit-and-resend drops attachments:** editing a user message creates a new sibling with the new text only; the old message keeps its files.
- **No drag-and-drop or paste-to-attach**, no image thumbnails/previews; chips are text only.
- **Search:** no GIN index yet (sequential scan within the user's own rows - fine for small histories, to be indexed before scale), no ranking
  or snippets, word-prefix matching only, results capped at 50, history list still has no cursor pagination.
- **Account deletion** (cascade to files) is not implemented; the DB cascade exists but nothing removes the stored bytes in that path.
- **Orphan files:** if the process dies between writing bytes and inserting the row, or a storage delete fails after a DB delete, bytes can be left
  unreachable on disk (no DB row points to them). No sweeper exists yet.
- **Quota accounting** still counts tokens only; uploads are rate limited but not size-metered per day.
- Not measured: upload throughput, memory use for 20 MB files (each upload is buffered fully in memory once), search latency on large histories.
- Dev side effects: `.data/` (gitignored) and `test-results/e2e-uploads` hold test files; Docker containers still running; new migration
  `20261109174334_attachments` was applied to the dev database.
- The two tests deferred from M3 (artifact error page, `Origin: null`) are **still not written**, as you asked to do them later.

## Open questions

- Is single-instance local-disk storage acceptable until M7, or do you want the S3/MinIO driver before M5?
- Should edit-and-resend carry the original message's attachments over?
- OK to defer PDF page-count/image-dimension checks (need a PDF parser dependency) until a live API test shows how often it matters?

## Next step

User go-ahead for M5 (deep research: worker, search provider, citations, progress UI). M5 needs Q4 (search provider API key) and Q8 (Anthropic key + spending cap).

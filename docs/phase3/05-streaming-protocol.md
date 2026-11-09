# Streaming Protocol

Two layers: (A) upstream Anthropic Messages streaming, consumed server-side; (B) our own browser-facing SSE contract. The browser never talks to Anthropic and never sees the API key.

## A. Upstream (public API docs — verify event names against current docs at M2)
Server uses the official SDK's streaming helper with `stream: true`. Event types documented publicly: `message_start`, `content_block_start`, `content_block_delta` (text_delta / input_json_delta / thinking deltas), `content_block_stop`, `message_delta` (stop_reason, usage), `message_stop`, `ping`, `error`. Tool use arrives as `tool_use` blocks with JSON streamed as partial strings.

## B. Browser-facing SSE (`text/event-stream`, UTF-8, `Cache-Control: no-store`, `X-Accel-Buffering: no`)
Each event: `id: <seq>`, `event: <type>`, `data: <json>`. Our own taxonomy (not upstream's):

| event | data | notes |
|---|---|---|
| `message.start` | `{message_id, parent_id, model}` | after user message persisted |
| `text.delta` | `{index, text}` | append-only |
| `tool.start` / `tool.result` | `{id, name, summary}` | summaries only, never raw secrets |
| `citation` | `{index, source_id}` | research mode |
| `usage` | `{input_tokens, output_tokens}` | |
| `message.stop` | `{status: complete\|stopped, stop_reason}` | |
| `error` | `{code, message, retryable}` | then close |
| `ping` | `{}` every 15 s | keep-alive |

Research progress stream (`/research-runs/{id}/events`) adds: `run.status`, `step.start`, `step.update`, `step.done`, `source.found`, `report.delta`, `run.done`.

## Behaviors
- **Persist-as-you-go:** assistant message row created `streaming`; content flushed to DB every ~500 ms or 2 KB; finalized on stop/error. Server crash leaves `streaming` rows → reaper marks `error` after timeout.
- **Cancel:** client `AbortController`/connection close → server aborts upstream request (`AbortSignal`) → message saved `stopped`. `POST /messages/{id}/stop` for non-connected cases.
- **Resume (research only):** `Last-Event-ID` replay from stored events (Redis stream / DB). Chat streams are not resumable; reload shows persisted partial.
- **Backpressure:** write via `ReadableStream`; stop reading upstream if client socket closed.
- **Client rendering:** batch deltas with `requestAnimationFrame`; incremental markdown parse of the tail block only; sanitize (no raw HTML); `aria-live="polite"` region updates at sentence granularity, not per token.
- **Errors:** pre-stream errors → HTTP problem+json; mid-stream → `error` event. Upstream 429/529 → retry with jittered backoff before first token only.
- **Limits:** max output tokens per request, max concurrent streams per user (default 2).

Open questions: none · Next step: security model.

## As built in M2 (differences from the draft above)
- Upstream event names and `thinking_delta` / `signature_delta` / error-event shape were **verified against the public streaming docs on 2026-11-06**. Thinking and tool deltas are ignored in M2 (final text only).
- Browser events implemented: `message.start`, `text.delta`, `usage`, `message.stop`, `error`, `ping` (every 15 s). `tool.*`, `citation`, resume via `Last-Event-ID` are **not** implemented (research, M5).
- **Stop** = `POST /api/messages/{id}/stop`; the server aborts the upstream request and the open stream ends itself with `message.stop {status:"stopped"}`. Client drops the connection after 3 s if it does not. Closing the connection also aborts upstream and saves `stopped`.
- `error` events carry only a stable `code` (`rate_limited`, `overloaded`, `invalid_request`, `upstream_error`, `llm_not_configured`); raw upstream text is never forwarded.
- Pre-stream failures are RFC 9457 `application/problem+json` (`401/403/404/422/429`, `Retry-After` on 429).
- Responses carry **no CORS headers** (same-origin only).
- Persistence: assistant row created as `streaming`, flushed every 500 ms or 2 KB, finalized as `complete | stopped | error`. Rows left `streaming` for >2 min and not in flight are marked `error/interrupted` when the conversation is next loaded.
- The in-flight registry (stop-by-id, concurrency cap) is **per process**: with more than one server instance, stop-by-id and the concurrent-stream cap would not be shared. Closing the connection still works across instances.

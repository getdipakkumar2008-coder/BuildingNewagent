# ADR-005: SSE for streaming, not WebSocket

Status: Proposed

## Context
Server-to-client token streaming with POST to start; cancel via abort.

## Decision
Use SSE over fetch (ReadableStream) with our own event taxonomy; resume via Last-Event-ID for research only.

## Consequences
+ simple, proxy-friendly, HTTP auth/CSRF reuse. - one-way; EventSource can't POST, so use fetch streaming.

## Alternatives
WebSocket (bidirectional, more infra); long polling (worse UX).

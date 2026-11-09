import { encodeSse } from "@/lib/sse";
import type { Generation } from "./service";

const PING_MS = 15_000;

/**
 * Wraps a Generation in a text/event-stream Response.
 * - Same-origin only: no CORS headers are sent (unlike some open-source chat UIs that send `*`).
 * - Client disconnect (cancel) aborts the upstream request; the service then saves status "stopped".
 */
export function sseResponse(gen: Generation): Response {
  const enc = new TextEncoder();
  let seq = 0;
  let closed = false;
  let ping: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          closed = true;
        }
      };
      ping = setInterval(() => send(encodeSse({ event: "ping", data: {} })), PING_MS);
      try {
        for await (const ev of gen.events) send(encodeSse(ev, ++seq));
      } catch {
        send(
          encodeSse({
            event: "error",
            data: { code: "internal_error", message: "Stream failed.", retryable: true },
          }),
        );
      } finally {
        clearInterval(ping);
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed by cancel */
          }
        }
      }
    },
    cancel() {
      closed = true;
      if (ping) clearInterval(ping);
      gen.abort();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

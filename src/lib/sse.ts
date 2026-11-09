// Browser-facing SSE contract (see docs/phase3/05-streaming-protocol.md). Our own taxonomy.

export type ChatEvent =
  | {
      event: "message.start";
      data: {
        message_id: string;
        user_message_id: string;
        parent_id: string | null;
        model: string;
      };
    }
  | { event: "text.delta"; data: { text: string } }
  | { event: "usage"; data: { input_tokens: number; output_tokens: number } }
  | { event: "message.stop"; data: { status: "complete" | "stopped"; stop_reason: string | null } }
  | { event: "error"; data: { code: string; message: string; retryable: boolean } }
  | { event: "ping"; data: Record<string, never> };

export function encodeSse(ev: ChatEvent, id?: number): string {
  const idLine = id === undefined ? "" : `id: ${id}\n`;
  return `${idLine}event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`;
}

/**
 * Incremental SSE parser. Feed arbitrary text chunks; returns completed events.
 * Handles events split across chunks, CRLF, comments and multi-line data.
 */
export class SseParser {
  private buffer = "";

  push(chunk: string): ChatEvent[] {
    this.buffer += chunk.replace(/\r\n/g, "\n");
    const out: ChatEvent[] = [];
    let idx: number;
    while ((idx = this.buffer.indexOf("\n\n")) !== -1) {
      const raw = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      const ev = parseBlock(raw);
      if (ev) out.push(ev);
    }
    return out;
  }
}

function parseBlock(raw: string): ChatEvent | null {
  let event = "message";
  const data: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
  }
  if (data.length === 0) return null;
  try {
    return { event, data: JSON.parse(data.join("\n")) } as ChatEvent;
  } catch {
    return null; // malformed block: drop rather than crash the stream
  }
}

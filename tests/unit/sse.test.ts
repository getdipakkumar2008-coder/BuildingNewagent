import { describe, expect, it } from "vitest";
import { SseParser, encodeSse } from "@/lib/sse";

describe("SSE codec", () => {
  it("round-trips an event with id", () => {
    const wire = encodeSse({ event: "text.delta", data: { text: "hi" } }, 3);
    expect(wire).toBe('id: 3\nevent: text.delta\ndata: {"text":"hi"}\n\n');
    expect(new SseParser().push(wire)).toEqual([{ event: "text.delta", data: { text: "hi" } }]);
  });

  it("reassembles events split across arbitrary chunk boundaries", () => {
    const wire =
      encodeSse({ event: "text.delta", data: { text: "a" } }) +
      encodeSse({ event: "text.delta", data: { text: "b\nc" } });
    const p = new SseParser();
    const out = [];
    for (const ch of wire) out.push(...p.push(ch)); // one character at a time
    expect(out.map((e) => (e.data as { text: string }).text)).toEqual(["a", "b\nc"]);
  });

  it("handles CRLF, comments and ignores malformed JSON without throwing", () => {
    const p = new SseParser();
    const out = p.push(
      ': keepalive\r\n\r\nevent: text.delta\r\ndata: {"text":"x"}\r\n\r\nevent: text.delta\r\ndata: {bad\r\n\r\n',
    );
    expect(out).toEqual([{ event: "text.delta", data: { text: "x" } }]);
  });

  it("does not emit an incomplete trailing event", () => {
    expect(new SseParser().push('event: text.delta\ndata: {"text":"x"}\n')).toEqual([]);
  });
});

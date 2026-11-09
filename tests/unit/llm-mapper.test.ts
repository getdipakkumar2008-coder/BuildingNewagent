import { describe, expect, it } from "vitest";
import { mapUpstreamEvent, toLlmError } from "@/server/llm/anthropic";
import { LlmError } from "@/server/llm/types";

describe("mapUpstreamEvent", () => {
  it("maps text deltas", () => {
    expect(
      mapUpstreamEvent({
        type: "content_block_delta",
        index: 1,
        delta: { type: "text_delta", text: "Hi" },
      }),
    ).toEqual([{ type: "text", text: "Hi" }]);
  });

  it("ignores thinking, signature and tool-input deltas", () => {
    for (const delta of [
      { type: "thinking_delta", thinking: "secret" },
      { type: "signature_delta", signature: "sig" },
      { type: "input_json_delta", partial_json: '{"a":' },
    ]) {
      expect(mapUpstreamEvent({ type: "content_block_delta", index: 0, delta })).toEqual([]);
    }
  });

  it("ignores empty text deltas and unknown event types", () => {
    expect(
      mapUpstreamEvent({ type: "content_block_delta", delta: { type: "text_delta", text: "" } }),
    ).toEqual([]);
    expect(mapUpstreamEvent({ type: "something_new" })).toEqual([]);
    expect(mapUpstreamEvent(null)).toEqual([]);
    expect(mapUpstreamEvent("x")).toEqual([]);
  });

  it("extracts input tokens from message_start", () => {
    expect(
      mapUpstreamEvent({
        type: "message_start",
        message: { usage: { input_tokens: 25, output_tokens: 1 } },
      }),
    ).toEqual([{ type: "usage", inputTokens: 25 }]);
  });

  it("extracts output tokens and stop reason from message_delta", () => {
    expect(
      mapUpstreamEvent({
        type: "message_delta",
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { output_tokens: 15 },
      }),
    ).toEqual([
      { type: "usage", outputTokens: 15 },
      { type: "stop", stopReason: "end_turn" },
    ]);
  });
});

describe("toLlmError", () => {
  it("classifies by HTTP status", () => {
    expect(toLlmError({ status: 429 })).toMatchObject({ code: "rate_limited", retryable: true });
    expect(toLlmError({ status: 529 })).toMatchObject({ code: "overloaded", retryable: true });
    expect(toLlmError({ status: 400 })).toMatchObject({
      code: "invalid_request",
      retryable: false,
    });
  });

  it("classifies a mid-stream error event", () => {
    expect(toLlmError({ error: { error: { type: "overloaded_error" } } }).code).toBe("overloaded");
  });

  it("never forwards raw upstream messages", () => {
    const e = toLlmError({ status: 500, message: "internal key sk-ant-SECRET leaked" });
    expect(e.message).not.toContain("SECRET");
    expect(e.code).toBe("upstream_error");
  });

  it("passes LlmError through", () => {
    const original = new LlmError("llm_not_configured", false, "x");
    expect(toLlmError(original)).toBe(original);
  });
});

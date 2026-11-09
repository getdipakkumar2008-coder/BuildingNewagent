import Anthropic from "@anthropic-ai/sdk";
import { LlmError, type Llm, type LlmEvent } from "./types";

/**
 * Maps one upstream streaming event (Messages API, verified against the public streaming docs)
 * to our provider-neutral events. Thinking / signature / tool deltas are intentionally ignored:
 * M2 shows final text only. Unknown event types are ignored for forward compatibility.
 */
export function mapUpstreamEvent(ev: unknown): LlmEvent[] {
  if (typeof ev !== "object" || ev === null) return [];
  const e = ev as Record<string, unknown>;
  switch (e.type) {
    case "message_start": {
      const usage = (e.message as { usage?: { input_tokens?: number } } | undefined)?.usage;
      return usage?.input_tokens === undefined
        ? []
        : [{ type: "usage", inputTokens: usage.input_tokens }];
    }
    case "content_block_delta": {
      const delta = e.delta as { type?: string; text?: string } | undefined;
      return delta?.type === "text_delta" && typeof delta.text === "string" && delta.text !== ""
        ? [{ type: "text", text: delta.text }]
        : [];
    }
    case "message_delta": {
      const out: LlmEvent[] = [];
      const usage = e.usage as { output_tokens?: number } | undefined;
      if (usage?.output_tokens !== undefined) {
        out.push({ type: "usage", outputTokens: usage.output_tokens });
      }
      const stop = (e.delta as { stop_reason?: string | null } | undefined)?.stop_reason;
      if (stop !== undefined) out.push({ type: "stop", stopReason: stop });
      return out;
    }
    default:
      return [];
  }
}

/** Translates a mid-stream `error` event or SDK exception into a stable LlmError. */
export function toLlmError(err: unknown): LlmError {
  if (err instanceof LlmError) return err;
  const status = (err as { status?: number })?.status;
  const type = (err as { error?: { error?: { type?: string } } })?.error?.error?.type;
  if (status === 429 || type === "rate_limit_error") {
    return new LlmError("rate_limited", true, "The model is rate limited. Try again shortly.");
  }
  if (status === 529 || type === "overloaded_error") {
    return new LlmError("overloaded", true, "The model is overloaded. Try again shortly.");
  }
  if (status === 400 || status === 422) {
    return new LlmError("invalid_request", false, "The request could not be processed.");
  }
  return new LlmError("upstream_error", true, "The model request failed.");
}

export function createAnthropicLlm(opts: { apiKey?: string; baseURL?: string }): Llm {
  return async function* (req) {
    if (!opts.apiKey) {
      throw new LlmError("llm_not_configured", false, "The model API key is not configured.");
    }
    const client = new Anthropic({ apiKey: opts.apiKey, baseURL: opts.baseURL, maxRetries: 2 });
    try {
      const stream = await client.messages.create(
        {
          model: req.model,
          max_tokens: req.maxTokens,
          system: req.system,
          messages: req.messages,
          stream: true,
        },
        { signal: req.signal },
      );
      for await (const ev of stream) {
        if ((ev as { type?: string }).type === "error") throw { error: ev };
        yield* mapUpstreamEvent(ev);
      }
    } catch (err) {
      if (req.signal.aborted) return; // caller-initiated stop is not an error
      throw toLlmError(err);
    }
  };
}

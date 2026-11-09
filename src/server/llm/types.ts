export type LlmBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: {
        type: "base64";
        media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
        data: string;
      };
    }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

export type LlmMessage =
  { role: "user"; content: string | LlmBlock[] } | { role: "assistant"; content: string };

/** Provider-neutral events produced by the LLM layer. */
export type LlmEvent =
  | { type: "text"; text: string }
  | { type: "usage"; inputTokens?: number; outputTokens?: number }
  | { type: "stop"; stopReason: string | null };

export type LlmRequest = {
  model: string;
  system?: string;
  messages: LlmMessage[];
  maxTokens: number;
  signal: AbortSignal;
};

export type Llm = (req: LlmRequest) => AsyncIterable<LlmEvent>;

/** Stable, user-safe failure categories. Raw upstream messages are never forwarded. */
export type LlmErrorCode =
  "llm_not_configured" | "rate_limited" | "overloaded" | "invalid_request" | "upstream_error";

export class LlmError extends Error {
  constructor(
    public readonly code: LlmErrorCode,
    public readonly retryable: boolean,
    message: string,
  ) {
    super(message);
  }
}

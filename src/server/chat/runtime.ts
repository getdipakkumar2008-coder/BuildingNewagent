import { createAnthropicLlm } from "@/server/llm/anthropic";
import { getRateLimiter } from "@/server/ratelimit";
import { getStorage } from "@/server/storage";
import { getChatConfig, type ChatDeps } from "./service";

/** Production wiring. Tests construct ChatDeps directly with a fake-server LLM. */
export function getChatDeps(): ChatDeps {
  return {
    llm: createAnthropicLlm({
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
    }),
    limiter: getRateLimiter(),
    config: getChatConfig(),
    storage: getStorage(),
  };
}

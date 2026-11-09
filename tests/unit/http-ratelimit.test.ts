import { describe, expect, it } from "vitest";

import { HttpError, assertSameOrigin, CSRF_HEADER, CSRF_VALUE } from "@/server/errors";
import { MemoryRateLimiter } from "@/server/ratelimit";
import { getChatConfig } from "@/server/chat/service";

const req = (headers: Record<string, string>) =>
  new Request("http://localhost:3000/api/x", { method: "POST", headers });

describe("assertSameOrigin (CSRF)", () => {
  it("accepts same-origin requests carrying the custom header", () => {
    expect(() =>
      assertSameOrigin(req({ origin: "http://localhost:3000", [CSRF_HEADER]: CSRF_VALUE })),
    ).not.toThrow();
  });

  it("rejects a foreign Origin even with the header", () => {
    expect(() =>
      assertSameOrigin(req({ origin: "https://evil.example", [CSRF_HEADER]: CSRF_VALUE })),
    ).toThrow(HttpError);
  });

  it("rejects a missing custom header", () => {
    expect(() => assertSameOrigin(req({ origin: "http://localhost:3000" }))).toThrow(/CSRF/);
  });

  it("rejects an unparsable Origin", () => {
    expect(() => assertSameOrigin(req({ origin: "null", [CSRF_HEADER]: CSRF_VALUE }))).toThrow(
      HttpError,
    );
  });
});

describe("MemoryRateLimiter", () => {
  it("allows up to the limit then blocks with a retry hint", async () => {
    const rl = new MemoryRateLimiter(() => 1000);
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rl.hit("k", 3, 60));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3]?.retryAfterSec).toBe(60);
  });

  it("isolates keys and resets after the window", async () => {
    let now = 0;
    const rl = new MemoryRateLimiter(() => now);
    await rl.hit("a", 1, 10);
    expect((await rl.hit("a", 1, 10)).allowed).toBe(false);
    expect((await rl.hit("b", 1, 10)).allowed).toBe(true);
    now = 10_001;
    expect((await rl.hit("a", 1, 10)).allowed).toBe(true);
  });
});

describe("getChatConfig", () => {
  it("uses defaults and ignores non-numeric env values", () => {
    const c = getChatConfig({ MAX_OUTPUT_TOKENS: "abc", DAILY_TOKEN_LIMIT: "1000" });
    expect(c.maxOutputTokens).toBe(4096);
    expect(c.dailyTokenLimit).toBe(1000);
  });
});

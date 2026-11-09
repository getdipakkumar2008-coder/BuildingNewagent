import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/env";

describe("parseServerEnv", () => {
  it("boots with no secrets (M0)", () => {
    const env = parseServerEnv({});
    expect(env.NODE_ENV).toBe("development");
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("treats empty strings as unset", () => {
    expect(parseServerEnv({ ANTHROPIC_API_KEY: "" }).ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("rejects an invalid APP_URL without echoing values", () => {
    expect(() => parseServerEnv({ APP_URL: "not a url" })).toThrow(/APP_URL/);
  });

  it("rejects a too-short AUTH_SECRET", () => {
    expect(() => parseServerEnv({ AUTH_SECRET: "short" })).toThrow(/AUTH_SECRET/);
  });
});

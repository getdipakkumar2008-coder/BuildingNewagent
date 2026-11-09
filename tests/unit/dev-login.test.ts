import { describe, expect, it } from "vitest";
import { isDevLoginEnabled } from "@/server/auth/dev-login";

describe("isDevLoginEnabled", () => {
  it("is off by default", () => {
    expect(isDevLoginEnabled({ NODE_ENV: "development" })).toBe(false);
  });
  it("is on only when explicitly enabled outside production", () => {
    expect(isDevLoginEnabled({ NODE_ENV: "development", DEV_LOGIN: "1" })).toBe(true);
    expect(isDevLoginEnabled({ NODE_ENV: "test", DEV_LOGIN: "1" })).toBe(true);
  });
  it("can never be enabled in production", () => {
    expect(isDevLoginEnabled({ NODE_ENV: "production", DEV_LOGIN: "1" })).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { buildCsp } from "@/lib/csp";

describe("buildCsp", () => {
  const prod = buildCsp("abc123", false);

  it("uses the nonce and forbids unsafe-inline scripts in production", () => {
    expect(prod).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(prod).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(prod).not.toContain("unsafe-eval");
  });

  it("blocks framing, plugins and foreign base/form targets", () => {
    for (const d of [
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ]) {
      expect(prod).toContain(d);
    }
  });

  it("allows inline style attributes only, not inline <style> elements, in production", () => {
    expect(prod).toContain("style-src-attr 'unsafe-inline'");
    expect(prod).toMatch(/style-src 'self' 'nonce-abc123'/);
  });

  it("only allows eval in development", () => {
    expect(buildCsp("n", true)).toContain("'unsafe-eval'");
  });
});

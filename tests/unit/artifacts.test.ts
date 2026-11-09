import { describe, expect, it } from "vitest";
import {
  ARTIFACT_CSP,
  ARTIFACT_IFRAME_SANDBOX,
  buildArtifactDocument,
  extractArtifacts,
} from "@/lib/artifacts";

const html = "```html\n<html><head><title>My Page</title></head><body>hi</body></html>\n```";

describe("extractArtifacts", () => {
  it("extracts complete html and svg blocks with ordinals and titles", () => {
    const md = `Intro\n\n${html}\n\ntext\n\n\`\`\`svg\n<svg><title>Dot</title><circle r="5"/></svg>\n\`\`\``;
    const a = extractArtifacts(md);
    expect(a.map((x) => [x.index, x.language, x.title])).toEqual([
      [0, "html", "My Page"],
      [1, "svg", "Dot"],
    ]);
  });

  it("ignores other languages and unclosed (still streaming) fences", () => {
    expect(extractArtifacts("```ts\nconst a = 1\n```")).toEqual([]);
    expect(extractArtifacts("```html\n<p>half streamed")).toEqual([]);
  });

  it("an unclosed fence swallows later blocks (matches how markdown renders it)", () => {
    expect(extractArtifacts("```ts\nnever closed\n\n```html\n<p>x</p>\n```")).toEqual([]);
  });

  it("gives fallback titles and skips empty blocks", () => {
    expect(extractArtifacts("```html\n<p>x</p>\n```")[0]?.title).toBe("HTML page 1");
    expect(extractArtifacts("```html\n\n```")).toEqual([]);
  });

  it("handles ~~~ fences and longer fences containing shorter ones", () => {
    expect(extractArtifacts("~~~html\n<p>x</p>\n~~~")).toHaveLength(1);
    const md = "````html\n<p>```not a close```</p>\n```\n<p>y</p>\n````";
    const a = extractArtifacts(md);
    expect(a).toHaveLength(1);
    expect(a[0]?.code).toContain("<p>y</p>");
  });

  it("is deterministic so server and client agree on ordinals", () => {
    const md = `${html}\n\n${html}`;
    expect(extractArtifacts(md)).toEqual(extractArtifacts(md));
    expect(extractArtifacts(md).map((x) => x.index)).toEqual([0, 1]);
  });

  it("rejects oversized artifacts", () => {
    const big = `\`\`\`html\n${"x".repeat(600 * 1024)}\n\`\`\``;
    expect(extractArtifacts(big)).toEqual([]);
  });
});

describe("artifact sandbox constants", () => {
  it("iframe sandbox never grants same-origin, popups, forms or top navigation", () => {
    expect(ARTIFACT_IFRAME_SANDBOX).toBe("allow-scripts");
    for (const bad of [
      "allow-same-origin",
      "allow-popups",
      "allow-forms",
      "allow-top-navigation",
      "allow-modals",
    ]) {
      expect(ARTIFACT_IFRAME_SANDBOX).not.toContain(bad);
    }
  });

  it("response CSP sandboxes the document and blocks every outbound channel", () => {
    expect(ARTIFACT_CSP).toMatch(/^sandbox allow-scripts;/);
    expect(ARTIFACT_CSP).not.toContain("allow-same-origin");
    for (const d of [
      "default-src 'none'",
      "connect-src 'none'",
      "frame-src 'none'",
      "form-action 'none'",
      "base-uri 'none'",
      "frame-ancestors 'self'",
    ]) {
      expect(ARTIFACT_CSP).toContain(d);
    }
    expect(ARTIFACT_CSP).toContain("img-src data:"); // no remote images (exfiltration channel)
  });
});

describe("buildArtifactDocument", () => {
  it("wraps fragments and keeps complete documents untouched", () => {
    expect(buildArtifactDocument({ language: "html", code: "<p>x</p>" })).toMatch(
      /^<!doctype html>/i,
    );
    const full = "<!doctype html><html><body>y</body></html>";
    expect(buildArtifactDocument({ language: "html", code: full })).toBe(full);
  });

  it("embeds svg in a page", () => {
    expect(buildArtifactDocument({ language: "svg", code: "<svg/>" })).toContain(
      "<body><svg/></body>",
    );
  });
});

describe("artifact review fixes", () => {
  it("ignores backtick info strings but accepts tilde fences", () => {
    expect(extractArtifacts("```html``` x\n<p>a</p>\n```")).toEqual([]);
    expect(extractArtifacts("~~~html\n<p>a</p>\n~~~")).toHaveLength(1);
  });

  it("limits size by UTF-8 bytes, not characters", () => {
    const big = "あ".repeat(200_000); // 200k chars, 600k bytes
    expect(extractArtifacts("```html\n" + big + "\n```")).toEqual([]);
  });

  it("strips the XML prolog and doctype from svg documents", () => {
    const doc = buildArtifactDocument({
      language: "svg",
      code: '<?xml version="1.0"?>\n<!DOCTYPE svg>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    });
    expect(doc).not.toContain("<?xml");
    expect(doc).toContain("<svg");
  });
});

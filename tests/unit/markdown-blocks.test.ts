import { describe, expect, it } from "vitest";
import { splitBlocks } from "@/lib/markdown-blocks";

describe("splitBlocks", () => {
  it("returns [] for empty text and one block for a single paragraph", () => {
    expect(splitBlocks("")).toEqual([]);
    expect(splitBlocks("hello\nworld")).toEqual(["hello\nworld"]);
  });

  it("splits paragraphs at blank lines", () => {
    expect(splitBlocks("a\n\nb\n\n\nc")).toEqual(["a", "b", "c"]);
  });

  it("keeps a fenced code block with blank lines inside as ONE block", () => {
    const text = "intro\n\n```ts\nconst a = 1;\n\nconst b = 2;\n```\n\noutro";
    expect(splitBlocks(text)).toEqual([
      "intro",
      "```ts\nconst a = 1;\n\nconst b = 2;\n```",
      "outro",
    ]);
  });

  it("treats an unclosed fence (mid-stream) as one growing tail block", () => {
    const text = "intro\n\n```py\nprint(1)\n\nprint(2)";
    const blocks = splitBlocks(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[1]).toBe("```py\nprint(1)\n\nprint(2)");
  });

  it("requires a closing fence at least as long as the opening one", () => {
    const text = "````md\n```\ninner\n```\n\nstill inside\n````\n\nafter";
    expect(splitBlocks(text)).toEqual(["````md\n```\ninner\n```\n\nstill inside\n````", "after"]);
  });

  it("supports ~~~ fences", () => {
    expect(splitBlocks("~~~\na\n\nb\n~~~")).toEqual(["~~~\na\n\nb\n~~~"]);
  });

  it("merges loose list items so numbering is preserved", () => {
    expect(splitBlocks("1. one\n\n2. two\n\n3. three")).toEqual(["1. one\n\n2. two\n\n3. three"]);
    expect(splitBlocks("- a\n\n- b")).toEqual(["- a\n\n- b"]);
  });

  it("merges an indented continuation into the preceding list item", () => {
    expect(splitBlocks("- item\n\n  continued paragraph")).toEqual([
      "- item\n\n  continued paragraph",
    ]);
  });

  it("does not merge a list into an unrelated paragraph", () => {
    expect(splitBlocks("para\n\n- item")).toEqual(["para", "- item"]);
  });

  it("normalises CRLF", () => {
    expect(splitBlocks("a\r\n\r\nb")).toEqual(["a", "b"]);
  });

  it("is prefix-stable: finished blocks do not change as text grows (what memoization relies on)", () => {
    const full =
      "# Title\n\nFirst paragraph.\n\n```js\nlet x = 1;\n```\n\nLast paragraph that is still streaming";
    const finished = splitBlocks(full).slice(0, -1);
    for (let n = full.indexOf("Last"); n <= full.length; n++) {
      expect(splitBlocks(full.slice(0, n)).slice(0, finished.length)).toEqual(finished);
    }
  });
});

describe("splitBlocks fence rules", () => {
  it("does not treat a backtick line with a backtick in the info string as a fence", () => {
    expect(splitBlocks("```npm install``` runs it\n\nnext paragraph")).toEqual([
      "```npm install``` runs it",
      "next paragraph",
    ]);
  });
});

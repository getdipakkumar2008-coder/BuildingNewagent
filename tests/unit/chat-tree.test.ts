import { describe, expect, it } from "vitest";
import { activePath, newestLeafUnder, siblingsOf, type TreeMsg } from "@/lib/chat-tree";

const m = (
  id: string,
  parentId: string | null,
  role: "user" | "assistant",
  t: number,
): TreeMsg => ({
  id,
  parentId,
  role,
  createdAt: t,
});

// u1 ─ a1            (original)
//   └─ a1b           (regenerated reply, newer)
// u1e ─ a2           (edited first message, newest branch)
const all = [
  m("u1", null, "user", 1),
  m("a1", "u1", "assistant", 2),
  m("a1b", "u1", "assistant", 3),
  m("u1e", null, "user", 4),
  m("a2", "u1e", "assistant", 5),
];

describe("activePath", () => {
  it("defaults to the newest message as leaf", () => {
    expect(activePath(all, null).map((x) => x.id)).toEqual(["u1e", "a2"]);
  });

  it("follows an explicit leaf (older branch)", () => {
    expect(activePath(all, "a1").map((x) => x.id)).toEqual(["u1", "a1"]);
  });

  it("falls back to newest when the leaf id is unknown", () => {
    expect(activePath(all, "nope").map((x) => x.id)).toEqual(["u1e", "a2"]);
  });

  it("returns [] for an empty conversation", () => {
    expect(activePath([], null)).toEqual([]);
  });

  it("does not loop on a corrupted cycle", () => {
    const cyc = [m("x", "y", "user", 1), m("y", "x", "assistant", 2)];
    expect(activePath(cyc, "x").length).toBeLessThanOrEqual(2);
  });
});

describe("siblingsOf", () => {
  it("lists same-parent same-role messages oldest first", () => {
    expect(siblingsOf(all, all[1]!).map((x) => x.id)).toEqual(["a1", "a1b"]);
    expect(siblingsOf(all, all[0]!).map((x) => x.id)).toEqual(["u1", "u1e"]);
  });
});

describe("newestLeafUnder", () => {
  it("descends to the newest leaf of a subtree", () => {
    expect(newestLeafUnder(all, "u1")).toBe("a1b");
    expect(newestLeafUnder(all, "u1e")).toBe("a2");
  });

  it("returns the id itself for a leaf", () => {
    expect(newestLeafUnder(all, "a1")).toBe("a1");
  });
});

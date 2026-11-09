import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as repo from "@/server/repos/chat";
import { cleanupUsers, makeUser } from "./helpers";

describe("history search", () => {
  let a: { id: string };
  let b: { id: string };
  let byTitle: string;
  let byBody: string;
  let other: string;
  let foreign: string;

  async function conv(userId: string, title: string, bodyText: string) {
    const c = await repo.createConversation(userId, { model: "claude-sonnet-5-5" });
    await repo.updateConversation(userId, c.id, { title });
    await repo.createMessage(userId, {
      conversationId: c.id,
      parentId: null,
      role: "user",
      text: bodyText,
      status: "complete",
    });
    return c.id;
  }

  beforeAll(async () => {
    a = await makeUser("a");
    b = await makeUser("b");
    byTitle = await conv(a.id, "Quarterly zebrafish report", "hello");
    byBody = await conv(a.id, "Untitled", "Please summarise the zebrafish migration data");
    other = await conv(a.id, "Gardening", "tomatoes and basil");
    foreign = await conv(b.id, "zebrafish secrets", "zebrafish zebrafish");
  });

  afterAll(async () => {
    await cleanupUsers([a.id, b.id]);
  });

  it("finds by title and by message text, and not unrelated chats", async () => {
    const ids = (await repo.searchConversations(a.id, "zebrafish")).map((c) => c.id);
    expect(ids).toContain(byTitle);
    expect(ids).toContain(byBody);
    expect(ids).not.toContain(other);
  });

  it("matches word prefixes and several words together", async () => {
    expect((await repo.searchConversations(a.id, "zebra")).map((c) => c.id)).toContain(byTitle);
    const both = (await repo.searchConversations(a.id, "zebrafish migration")).map((c) => c.id);
    expect(both).toEqual([byBody]);
  });

  it("never returns another user's conversations", async () => {
    const ids = (await repo.searchConversations(a.id, "zebrafish secrets")).map((c) => c.id);
    expect(ids).not.toContain(foreign);
    expect((await repo.searchConversations(b.id, "zebrafish")).map((c) => c.id)).toEqual([foreign]);
  });

  it("does not match JSON structure words stored in message content", async () => {
    expect(await repo.searchConversations(a.id, "type")).toEqual([]);
  });

  it("treats tsquery operators and quotes as plain text, never as syntax errors", async () => {
    for (const q of ["'", "a & | ! b", "zebra:* <-> x", "\\", "); DROP TABLE users;--"]) {
      await expect(repo.searchConversations(a.id, q)).resolves.toBeInstanceOf(Array);
    }
    expect(await repo.searchConversations(a.id, "   ")).toEqual([]);
  });

  it("excludes archived conversations", async () => {
    await repo.updateConversation(a.id, byTitle, { archived: true });
    const ids = (await repo.searchConversations(a.id, "zebrafish")).map((c) => c.id);
    expect(ids).not.toContain(byTitle);
  });
});

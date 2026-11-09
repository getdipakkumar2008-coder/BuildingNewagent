import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import * as repo from "@/server/repos/chat";
import { cleanupUsers, makeUser } from "./helpers";

// IDOR: every repository function must refuse access to another user's data.
describe("repository tenant scoping", () => {
  let a: { id: string };
  let b: { id: string };
  let convId: string;
  let msgId: string;

  beforeAll(async () => {
    a = await makeUser("a");
    b = await makeUser("b");
    const conv = await repo.createConversation(a.id, { model: "claude-sonnet-5-5" });
    convId = conv.id;
    const m = await repo.createMessage(a.id, {
      conversationId: convId,
      parentId: null,
      role: "user",
      text: "secret",
      status: "complete",
    });
    msgId = m!.id;
  });

  afterAll(async () => {
    await cleanupUsers([a.id, b.id]);
  });

  it("owner can read their own data", async () => {
    expect((await repo.getConversation(a.id, convId))?.messages).toHaveLength(1);
    expect(await repo.ownConversation(a.id, convId)).not.toBeNull();
    expect(await repo.ownMessage(a.id, msgId)).not.toBeNull();
  });

  it("another user cannot get, list, or own the conversation", async () => {
    expect(await repo.getConversation(b.id, convId)).toBeNull();
    expect(await repo.ownConversation(b.id, convId)).toBeNull();
    expect((await repo.listConversations(b.id)).map((c) => c.id)).not.toContain(convId);
  });

  it("another user cannot read messages or message paths", async () => {
    expect(await repo.ownMessage(b.id, msgId)).toBeNull();
    expect(await repo.pathTo(b.id, msgId)).toEqual([]);
    expect(await repo.latestMessageId(b.id, convId)).toBeNull();
  });

  it("another user cannot write into the conversation", async () => {
    const created = await repo.createMessage(b.id, {
      conversationId: convId,
      parentId: msgId,
      role: "user",
      text: "injected",
      status: "complete",
    });
    expect(created).toBeNull();
    expect(await prisma.message.count({ where: { conversationId: convId } })).toBe(1);
  });

  it("another user cannot rename, change model, or delete", async () => {
    expect(
      await repo.updateConversation(b.id, convId, { title: "pwned", model: "claude-haiku-5-5" }),
    ).toBe(false);
    expect(await repo.deleteConversation(b.id, convId)).toBe(false);
    const still = await repo.getConversation(a.id, convId);
    expect(still?.title).toBe("New chat");
    expect(still?.model).toBe("claude-sonnet-5-5");
  });

  it("a parent from a different conversation is rejected even for the owner", async () => {
    const other = await repo.createConversation(a.id, { model: "claude-sonnet-5-5" });
    const bad = await repo.createMessage(a.id, {
      conversationId: other.id,
      parentId: msgId, // belongs to the first conversation
      role: "user",
      text: "x",
      status: "complete",
    });
    expect(bad).toBeNull();
  });

  it("usage counters are per user", async () => {
    await repo.addUsage(a.id, 10, 5);
    expect(await repo.tokensUsedToday(a.id)).toBe(15);
    expect(await repo.tokensUsedToday(b.id)).toBe(0);
  });

  it("owner delete cascades messages", async () => {
    const c = await repo.createConversation(a.id, { model: "claude-sonnet-5-5" });
    await repo.createMessage(a.id, {
      conversationId: c.id,
      parentId: null,
      role: "user",
      text: "x",
      status: "complete",
    });
    expect(await repo.deleteConversation(a.id, c.id)).toBe(true);
    expect(await prisma.message.count({ where: { conversationId: c.id } })).toBe(0);
  });
});

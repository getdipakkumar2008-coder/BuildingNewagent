import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import * as repo from "@/server/repos/chat";
import { abortMessage, startGeneration } from "@/server/chat/service";
import { HttpError } from "@/server/errors";
import {
  cleanupUsers,
  collect,
  makeDeps,
  makeUser,
  startFake,
  textFrom,
  type Fake,
} from "./helpers";

let fake: Fake;
const users: string[] = [];

beforeAll(async () => {
  fake = await startFake();
});
afterAll(async () => {
  await fake.close();
  await cleanupUsers(users);
});

async function setup(model = "claude-sonnet-5-5") {
  const user = await makeUser("svc");
  users.push(user.id);
  const conv = await repo.createConversation(user.id, { model });
  return { user, conv };
}

const send = (
  deps: ReturnType<typeof makeDeps>,
  userId: string,
  conversationId: string,
  text: string,
  parentId?: string | null,
) => startGeneration(deps, { kind: "send", userId, conversationId, text, parentId });

describe("send", () => {
  it("streams text, ignores thinking, persists both messages, sets title, records usage", async () => {
    const { user, conv } = await setup();
    const deps = makeDeps(fake);
    const gen = await send(deps, user.id, conv.id, "hello world");
    const events = await collect(gen);

    expect(events[0]?.event).toBe("message.start");
    const text = textFrom(events);
    expect(text).toBe("Hello from the fake model. You said: hello world");
    expect(text).not.toContain("private reasoning");
    expect(events.at(-1)).toEqual({
      event: "message.stop",
      data: { status: "complete", stop_reason: "end_turn" },
    });

    const saved = await repo.getConversation(user.id, conv.id);
    expect(saved?.title).toBe("hello world");
    expect(saved?.messages.map((m) => [m.role, m.status])).toEqual([
      ["user", "complete"],
      ["assistant", "complete"],
    ]);
    expect(repo.textOf(saved?.messages[1]?.content)).toBe(text);
    expect(await repo.tokensUsedToday(user.id)).toBeGreaterThan(0);

    const sent = fake.requests.at(-1)!.body;
    expect(sent.model).toBe("claude-sonnet-5-5");
    expect(sent.stream).toBe(true);
  });

  it("sends prior turns as history on follow-ups", async () => {
    const { user, conv } = await setup();
    const deps = makeDeps(fake);
    await collect(await send(deps, user.id, conv.id, "first"));
    await collect(await send(deps, user.id, conv.id, "second"));
    const msgs = fake.requests.at(-1)!.body.messages;
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(msgs[0]?.content).toBe("first");
    expect(msgs[2]?.content).toBe("second");
  });

  it("uses the conversation's model", async () => {
    const { user, conv } = await setup("claude-haiku-5-5");
    await collect(await send(makeDeps(fake), user.id, conv.id, "hi"));
    expect(fake.requests.at(-1)!.body.model).toBe("claude-haiku-5-5");
  });
});

describe("branching", () => {
  it("regenerate creates a sibling assistant reply and keeps the original", async () => {
    const { user, conv } = await setup();
    const deps = makeDeps(fake);
    const first = await send(deps, user.id, conv.id, "question");
    await collect(first);

    const regen = await startGeneration(deps, {
      kind: "regenerate",
      userId: user.id,
      messageId: first.assistantMessageId,
    });
    await collect(regen);

    const saved = await repo.getConversation(user.id, conv.id);
    const assistants = saved!.messages.filter((m) => m.role === "assistant");
    expect(assistants).toHaveLength(2);
    expect(assistants[0]!.parentId).toBe(assistants[1]!.parentId);
    // The regenerate request must not include the previous assistant answer as history.
    expect(fake.requests.at(-1)!.body.messages.map((m) => m.role)).toEqual(["user"]);
  });

  it("editing a message (new sibling under the same parent) sends only the chosen branch", async () => {
    const { user, conv } = await setup();
    const deps = makeDeps(fake);
    await collect(await send(deps, user.id, conv.id, "original"));
    // Edit the first user message: parent_id null → new root.
    await collect(await send(deps, user.id, conv.id, "edited", null));

    const msgs = fake.requests.at(-1)!.body.messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.content).toBe("edited");
    const saved = await repo.getConversation(user.id, conv.id);
    expect(saved!.messages.filter((m) => m.role === "user" && m.parentId === null)).toHaveLength(2);
  });

  it("rejects regenerating a user message", async () => {
    const { user, conv } = await setup();
    const deps = makeDeps(fake);
    await collect(await send(deps, user.id, conv.id, "q"));
    const userMsg = (await repo.getConversation(user.id, conv.id))!.messages[0]!;
    await expect(
      startGeneration(deps, { kind: "regenerate", userId: user.id, messageId: userMsg.id }),
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe("stop", () => {
  it("aborts upstream and saves the partial text as 'stopped'", async () => {
    const { user, conv } = await setup();
    const deps = makeDeps(fake);
    const gen = await send(deps, user.id, conv.id, "SLOW please");
    const seen: string[] = [];
    let stopped = false;
    for await (const ev of gen.events) {
      seen.push(ev.event);
      if (
        ev.event === "text.delta" &&
        !stopped &&
        seen.filter((s) => s === "text.delta").length === 3
      ) {
        stopped = abortMessage(user.id, gen.assistantMessageId);
      }
    }
    expect(stopped).toBe(true);
    expect(seen.at(-1)).toBe("message.stop");

    const saved = await repo.getConversation(user.id, conv.id);
    const assistant = saved!.messages.find((m) => m.role === "assistant")!;
    expect(assistant.status).toBe("stopped");
    const partial = repo.textOf(assistant.content);
    expect(partial.length).toBeGreaterThan(0);
    expect(partial.startsWith("word0 ")).toBe(true);
    expect(partial).not.toContain("word59"); // did not run to completion
  });

  it("another user cannot stop my generation", async () => {
    const { user, conv } = await setup();
    const other = await makeUser("other");
    users.push(other.id);
    const gen = await send(makeDeps(fake), user.id, conv.id, "SLOW run");
    const it = gen.events[Symbol.asyncIterator]();
    await it.next(); // message.start
    expect(abortMessage(other.id, gen.assistantMessageId)).toBe(false);
    expect(abortMessage(user.id, gen.assistantMessageId)).toBe(true);
    while (!(await it.next()).done); // drain
  });

  it("consumer cancellation (generator return) finalizes the row instead of leaving it streaming", async () => {
    const { user, conv } = await setup();
    const gen = await send(makeDeps(fake), user.id, conv.id, "SLOW cancel");
    const it = gen.events[Symbol.asyncIterator]();
    await it.next();
    await it.next();
    gen.abort(); // what the route does on client disconnect
    await it.return?.();
    const saved = await repo.getConversation(user.id, conv.id);
    const status = saved!.messages.find((m) => m.role === "assistant")!.status;
    expect(status).toBe("stopped");
  });
});

describe("errors", () => {
  it("maps a mid-stream overloaded error to a stable code and saves status 'error'", async () => {
    const { user, conv } = await setup();
    const events = await collect(await send(makeDeps(fake), user.id, conv.id, "FAIL_OVERLOADED"));
    expect(events.at(-1)).toMatchObject({
      event: "error",
      data: { code: "overloaded", retryable: true },
    });
    const assistant = (await repo.getConversation(user.id, conv.id))!.messages.find(
      (m) => m.role === "assistant",
    )!;
    expect(assistant.status).toBe("error");
  });

  it("maps upstream HTTP 429 to rate_limited without leaking upstream text", async () => {
    const { user, conv } = await setup();
    const events = await collect(await send(makeDeps(fake), user.id, conv.id, "HTTP429"));
    const err = events.at(-1);
    expect(err).toMatchObject({ event: "error", data: { code: "rate_limited" } });
    expect(JSON.stringify(err)).not.toContain("slow down");
  });

  it("reports llm_not_configured when no API key is set", async () => {
    const { user, conv } = await setup();
    const events = await collect(await send(makeDeps(fake, {}, ""), user.id, conv.id, "hi"));
    expect(events.at(-1)).toMatchObject({
      event: "error",
      data: { code: "llm_not_configured", retryable: false },
    });
  });
});

describe("authorization and limits", () => {
  it("another user cannot send into or regenerate from my conversation", async () => {
    const { user, conv } = await setup();
    const intruder = await makeUser("intruder");
    users.push(intruder.id);
    const deps = makeDeps(fake);
    const mine = await send(deps, user.id, conv.id, "mine");
    await collect(mine);

    await expect(send(deps, intruder.id, conv.id, "hi")).rejects.toMatchObject({ status: 404 });
    await expect(
      startGeneration(deps, {
        kind: "regenerate",
        userId: intruder.id,
        messageId: mine.assistantMessageId,
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(await prisma.message.count({ where: { conversationId: conv.id } })).toBe(2);
  });

  it("rate limits chat starts per user with Retry-After", async () => {
    const { user, conv } = await setup();
    const deps = makeDeps(fake, { chatsPerMinute: 2 });
    await collect(await send(deps, user.id, conv.id, "a"));
    await collect(await send(deps, user.id, conv.id, "b"));
    const err = await send(deps, user.id, conv.id, "c").catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toMatchObject({ status: 429, code: "rate_limited" });
    expect((err as HttpError).headers).toHaveProperty("Retry-After");
    // The blocked request must not have written a message.
    expect(await prisma.message.count({ where: { conversationId: conv.id } })).toBe(4);
  });

  it("blocks when the daily token quota is exhausted", async () => {
    const { user, conv } = await setup();
    await repo.addUsage(user.id, 600, 600);
    const err = await send(makeDeps(fake, { dailyTokenLimit: 1000 }), user.id, conv.id, "hi").catch(
      (e) => e,
    );
    expect(err).toMatchObject({ status: 429, code: "quota_exceeded" });
  });

  it("limits concurrent streams per user", async () => {
    const { user, conv } = await setup();
    const deps = makeDeps(fake, { maxConcurrentStreams: 1 });
    const first = await send(deps, user.id, conv.id, "SLOW one");
    const it = first.events[Symbol.asyncIterator]();
    await it.next();
    const err = await send(deps, user.id, conv.id, "two").catch((e) => e);
    expect(err).toMatchObject({ status: 429, code: "too_many_streams" });
    first.abort();
    while (!(await it.next()).done);
  });

  it("reaps abandoned streaming rows but keeps in-flight ones", async () => {
    const { user, conv } = await setup();
    const stale = await repo.createMessage(user.id, {
      conversationId: conv.id,
      parentId: null,
      role: "assistant",
      text: "",
      status: "streaming",
    });
    await prisma.message.update({
      where: { id: stale!.id },
      data: { createdAt: new Date(Date.now() - 10 * 60_000) },
    });
    await repo.reapStaleStreaming(user.id, conv.id, 2 * 60_000, []);
    expect((await prisma.message.findUnique({ where: { id: stale!.id } }))?.status).toBe("error");

    const kept = await repo.createMessage(user.id, {
      conversationId: conv.id,
      parentId: null,
      role: "assistant",
      text: "",
      status: "streaming",
    });
    await prisma.message.update({
      where: { id: kept!.id },
      data: { createdAt: new Date(Date.now() - 10 * 60_000) },
    });
    await repo.reapStaleStreaming(user.id, conv.id, 2 * 60_000, [kept!.id]);
    expect((await prisma.message.findUnique({ where: { id: kept!.id } }))?.status).toBe(
      "streaming",
    );
  });
});

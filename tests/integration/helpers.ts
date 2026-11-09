import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/server/db/client";
import { createAnthropicLlm } from "@/server/llm/anthropic";
import { MemoryRateLimiter } from "@/server/ratelimit";
import { getChatConfig, type ChatDeps, type Generation } from "@/server/chat/service";
import type { ChatEvent } from "@/lib/sse";
import { createLocalStorage, type Storage } from "@/server/storage";
// @ts-expect-error plain ESM helper without types
import { startFakeAnthropic } from "../support/fake-anthropic.mjs";

export type Fake = {
  url: string;
  requests: {
    body: {
      messages: { role: string; content: string | { type: string; [k: string]: unknown }[] }[];
      system?: string;
      model: string;
      stream: boolean;
    };
  }[];
  close: () => Promise<void>;
};

export async function startFake(): Promise<Fake> {
  return startFakeAnthropic(0);
}

export async function makeUser(label = "u") {
  return prisma.user.create({
    data: { email: `${label}-${randomUUID()}@test.local`, name: label },
  });
}

export function makeStorage(): Storage {
  return createLocalStorage(mkdtempSync(path.join(tmpdir(), "dra-uploads-")));
}

export function makeDeps(
  fake: Fake,
  overrides: Partial<ChatDeps["config"]> = {},
  apiKey = "test-key",
  storage: Storage = makeStorage(),
): ChatDeps {
  return {
    storage,
    llm: createAnthropicLlm({ apiKey, baseURL: fake.url }),
    limiter: new MemoryRateLimiter(),
    config: { ...getChatConfig({}), flushIntervalMs: 0, ...overrides },
  };
}

export async function collect(gen: Generation): Promise<ChatEvent[]> {
  const out: ChatEvent[] = [];
  for await (const ev of gen.events) out.push(ev);
  return out;
}

export const textFrom = (events: ChatEvent[]) =>
  events.flatMap((e) => (e.event === "text.delta" ? [e.data.text] : [])).join("");

export async function cleanupUsers(ids: string[]) {
  await prisma.user.deleteMany({ where: { id: { in: ids } } }); // cascades conversations/messages/usage
}

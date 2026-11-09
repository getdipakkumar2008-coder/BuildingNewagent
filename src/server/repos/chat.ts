import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";

/**
 * Repository for conversations and messages (ADR-004).
 * EVERY function takes `userId` and scopes by it. Route handlers must not use Prisma directly.
 */

export const TITLE_MAX = 60;

export function titleFrom(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > TITLE_MAX ? `${t.slice(0, TITLE_MAX - 1)}…` : t || "New chat";
}

export type TextContent = { type: "text"; text: string }[];

export function textOf(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((b) =>
      b && typeof b === "object" && (b as { type?: string }).type === "text"
        ? (b as { text: string }).text
        : "",
    )
    .join("");
}

export async function listConversations(userId: string, opts: { limit?: number } = {}) {
  return prisma.conversation.findMany({
    where: { userId, archivedAt: null },
    orderBy: { updatedAt: "desc" },
    take: Math.min(opts.limit ?? 50, 100),
    select: { id: true, title: true, model: true, mode: true, createdAt: true, updatedAt: true },
  });
}

/** Up to 8 letter/digit tokens from free text; anything else (operators, quotes) is dropped. */
export function searchTokens(q: string): string[] {
  return (q.normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 8);
}

/**
 * Full-text search over the caller's own conversation titles and message text (prefix match per word).
 * Scoped by user_id in SQL; the query string only reaches Postgres as a bound parameter built from
 * letters/digits, so it cannot inject tsquery operators.
 */
export async function searchConversations(userId: string, q: string, limit = 50) {
  const tokens = searchTokens(q);
  if (tokens.length === 0) return [];
  const tsq = tokens.map((t) => `${t}:*`).join(" & ");
  return prisma.$queryRaw<
    { id: string; title: string; model: string; mode: string; createdAt: Date; updatedAt: Date }[]
  >`
    SELECT c.id, c.title, c.model, c.mode, c.created_at AS "createdAt", c.updated_at AS "updatedAt"
    FROM conversations c
    WHERE c.user_id = ${userId}::uuid
      AND c.archived_at IS NULL
      AND (
        to_tsvector('simple', c.title) @@ to_tsquery('simple', ${tsq})
        OR EXISTS (
          SELECT 1 FROM messages m
          WHERE m.conversation_id = c.id
            AND to_tsvector(
                  'simple',
                  jsonb_path_query_array(m.content, '$[*] ? (@.type == "text").text')::text
                ) @@ to_tsquery('simple', ${tsq})
        )
      )
    ORDER BY c.updated_at DESC
    LIMIT ${Math.min(limit, 100)}
  `;
}

export async function createConversation(userId: string, data: { model: string; mode?: string }) {
  return prisma.conversation.create({
    data: { userId, model: data.model, mode: data.mode ?? "chat" },
    select: { id: true, title: true, model: true, mode: true, createdAt: true, updatedAt: true },
  });
}

export async function getConversation(userId: string, id: string) {
  return prisma.conversation.findFirst({
    where: { id, userId },
    select: {
      id: true,
      title: true,
      model: true,
      mode: true,
      createdAt: true,
      updatedAt: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          parentId: true,
          role: true,
          content: true,
          status: true,
          model: true,
          createdAt: true,
          attachments: {
            orderBy: { createdAt: "asc" },
            select: { id: true, filename: true, mime: true, sizeBytes: true },
          },
        },
      },
    },
  });
}

export async function updateConversation(
  userId: string,
  id: string,
  patch: { title?: string; model?: string; archived?: boolean },
) {
  const data: Prisma.ConversationUpdateManyMutationInput = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.model !== undefined) data.model = patch.model;
  if (patch.archived !== undefined) data.archivedAt = patch.archived ? new Date() : null;
  const res = await prisma.conversation.updateMany({ where: { id, userId }, data });
  return res.count === 1;
}

export async function deleteConversation(userId: string, id: string) {
  const res = await prisma.conversation.deleteMany({ where: { id, userId } });
  return res.count === 1;
}

/** Ownership check that returns the conversation row (or null for missing / not yours). */
export async function ownConversation(userId: string, id: string) {
  return prisma.conversation.findFirst({
    where: { id, userId },
    select: { id: true, model: true, title: true },
  });
}

/** A message in a conversation the user owns, or null. */
export async function ownMessage(userId: string, messageId: string) {
  return prisma.message.findFirst({
    where: { id: messageId, conversation: { userId } },
    select: { id: true, conversationId: true, parentId: true, role: true, status: true },
  });
}

/** Walks parent links to the root and returns the chain oldest-first. Bounded to avoid cycles. */
export async function pathTo(userId: string, messageId: string, maxDepth = 500) {
  const chain: { id: string; role: string; content: unknown }[] = [];
  let cursor: string | null = messageId;
  while (cursor && chain.length < maxDepth) {
    const m: { id: string; role: string; content: unknown; parentId: string | null } | null =
      await prisma.message.findFirst({
        where: { id: cursor, conversation: { userId } },
        select: { id: true, role: true, content: true, parentId: true },
      });
    if (!m) break;
    chain.push({ id: m.id, role: m.role, content: m.content });
    cursor = m.parentId;
  }
  return chain.reverse();
}

/** Stored text of an assistant message the user owns (for serving artifacts), or null. */
export async function ownedAssistantText(userId: string, messageId: string) {
  const m = await prisma.message.findFirst({
    where: { id: messageId, role: "assistant", conversation: { userId } },
    select: { content: true, status: true },
  });
  return m ? { text: textOf(m.content), status: m.status } : null;
}

export async function latestMessageId(userId: string, conversationId: string) {
  const m = await prisma.message.findFirst({
    where: { conversationId, conversation: { userId } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return m?.id ?? null;
}

export async function createMessage(
  userId: string,
  data: {
    conversationId: string;
    parentId: string | null;
    role: "user" | "assistant";
    text: string;
    status: "complete" | "streaming";
    model?: string;
    /** Unsent attachments of this user to link to the new message (all-or-nothing). */
    attachmentIds?: string[];
  },
) {
  // Guard: the conversation (and parent, if any) must belong to this user.
  const conv = await ownConversation(userId, data.conversationId);
  if (!conv) return null;
  if (data.parentId) {
    const parent = await prisma.message.findFirst({
      where: { id: data.parentId, conversationId: data.conversationId },
      select: { id: true },
    });
    if (!parent) return null;
  }
  const ids = data.attachmentIds ?? [];
  if (new Set(ids).size !== ids.length) throw new AttachmentLinkError(); // duplicates are a client bug
  const msg = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: {
        conversationId: data.conversationId,
        parentId: data.parentId,
        role: data.role,
        content: [{ type: "text", text: data.text }],
        status: data.status,
        model: data.model,
      },
      select: { id: true, parentId: true },
    });
    if (ids.length > 0) {
      const linked = await tx.attachment.updateMany({
        where: { id: { in: ids }, userId, messageId: null },
        data: { messageId: created.id },
      });
      // Missing, foreign, duplicate or already-sent ids: roll the whole message back.
      if (linked.count !== ids.length) throw new AttachmentLinkError();
    }
    return created;
  });
  await prisma.conversation.update({
    where: { id: data.conversationId },
    data: { updatedAt: new Date() },
  });
  return msg;
}

export class AttachmentLinkError extends Error {
  constructor() {
    super("attachment_unavailable");
  }
}

export async function setConversationTitleIfDefault(userId: string, id: string, title: string) {
  await prisma.conversation.updateMany({
    where: { id, userId, title: "New chat" },
    data: { title },
  });
}

export async function flushAssistantText(messageId: string, text: string) {
  await prisma.message.update({
    where: { id: messageId },
    data: { content: [{ type: "text", text }] },
  });
}

export async function finalizeAssistant(
  messageId: string,
  f: {
    text: string;
    status: "complete" | "stopped" | "error";
    stopReason?: string | null;
    inputTokens?: number;
    outputTokens?: number;
    errorCode?: string;
  },
) {
  await prisma.message.update({
    where: { id: messageId },
    data: {
      content: [{ type: "text", text: f.text }],
      status: f.status,
      stopReason: f.stopReason ?? null,
      inputTokens: f.inputTokens,
      outputTokens: f.outputTokens,
      errorCode: f.errorCode ?? null,
    },
  });
}

/** Marks abandoned `streaming` rows as errors (server crash / lost connection). */
export async function reapStaleStreaming(
  userId: string,
  conversationId: string,
  olderThanMs: number,
  keepIds: string[],
) {
  await prisma.message.updateMany({
    where: {
      conversationId,
      conversation: { userId },
      status: "streaming",
      createdAt: { lt: new Date(Date.now() - olderThanMs) },
      id: { notIn: keepIds },
    },
    data: { status: "error", errorCode: "interrupted" },
  });
}

const dayStart = (d = new Date()) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export async function addUsage(userId: string, inputTokens: number, outputTokens: number) {
  const day = dayStart();
  await prisma.usageCounter.upsert({
    where: { userId_day: { userId, day } },
    update: { inputTokens: { increment: inputTokens }, outputTokens: { increment: outputTokens } },
    create: { userId, day, inputTokens, outputTokens },
  });
}

export async function tokensUsedToday(userId: string): Promise<number> {
  const row = await prisma.usageCounter.findUnique({
    where: { userId_day: { userId, day: dayStart() } },
  });
  return (row?.inputTokens ?? 0) + (row?.outputTokens ?? 0);
}

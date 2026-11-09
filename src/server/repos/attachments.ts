import { prisma } from "@/server/db/client";

/** Attachment repository (ADR-004): every function is scoped by `userId`. */

export type AttachmentMeta = {
  id: string;
  filename: string;
  mime: string;
  sizeBytes: number;
};

const META = { id: true, filename: true, mime: true, sizeBytes: true } as const;

export async function createAttachment(
  userId: string,
  data: { filename: string; mime: string; sizeBytes: number; sha256: string; storageKey: string },
): Promise<AttachmentMeta> {
  return prisma.attachment.create({ data: { userId, ...data }, select: META });
}

/** The caller's attachment including its storage key, or null (missing or not theirs). */
export async function getOwnAttachment(userId: string, id: string) {
  return prisma.attachment.findFirst({
    where: { id, userId },
    select: { ...META, storageKey: true, messageId: true },
  });
}

/** Unsent attachments for this user, in the requested order. Missing / foreign / already-sent ids are absent. */
export async function pendingAttachments(userId: string, ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await prisma.attachment.findMany({
    where: { id: { in: ids }, userId, messageId: null },
    select: META,
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
}

/** Deletes an UNSENT attachment row and returns its storage key (sent ones go with their message). */
export async function deletePendingAttachment(userId: string, id: string) {
  const row = await prisma.attachment.findFirst({
    where: { id, userId },
    select: { storageKey: true, messageId: true },
  });
  if (!row) return { status: "not_found" as const };
  if (row.messageId) return { status: "attached" as const };
  const res = await prisma.attachment.deleteMany({ where: { id, userId, messageId: null } });
  return res.count === 1
    ? { status: "deleted" as const, storageKey: row.storageKey }
    : { status: "not_found" as const };
}

/** Attachments (with storage keys) for a set of messages the caller owns. */
export async function attachmentsForMessages(userId: string, messageIds: string[]) {
  if (messageIds.length === 0) return [];
  return prisma.attachment.findMany({
    where: { messageId: { in: messageIds }, userId },
    orderBy: { createdAt: "asc" },
    select: { ...META, storageKey: true, messageId: true },
  });
}

export async function storageKeysForConversation(userId: string, conversationId: string) {
  const rows = await prisma.attachment.findMany({
    where: { userId, message: { conversationId, conversation: { userId } } },
    select: { storageKey: true },
  });
  return rows.map((r) => r.storageKey);
}

/** Removes the caller's unsent attachments older than `olderThanMs`; returns their storage keys. */
export async function reapPendingAttachments(userId: string, olderThanMs: number) {
  const where = {
    userId,
    messageId: null,
    createdAt: { lt: new Date(Date.now() - olderThanMs) },
  };
  const rows = await prisma.attachment.findMany({ where, select: { id: true, storageKey: true } });
  if (rows.length === 0) return [];
  await prisma.attachment.deleteMany({ where: { ...where, id: { in: rows.map((r) => r.id) } } });
  return rows.map((r) => r.storageKey);
}

/** How many unsent attachments the user currently holds (abuse bound on pending uploads). */
export async function countPendingAttachments(userId: string) {
  return prisma.attachment.count({ where: { userId, messageId: null } });
}

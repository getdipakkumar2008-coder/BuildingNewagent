import { createHash } from "node:crypto";
import { checkUpload, MAX_UPLOAD_BYTES, sanitizeFilename } from "@/lib/uploads";
import { HttpError, assertSameOrigin, requireUserId, toResponse } from "@/server/http";
import { getRateLimiter } from "@/server/ratelimit";
import * as attachmentRepo from "@/server/repos/attachments";
import { getStorage } from "@/server/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_PENDING_PER_USER = 30;
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;
// Multipart framing adds a little to the file itself.
const MAX_BODY_BYTES = MAX_UPLOAD_BYTES + 64 * 1024;

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const userId = await requireUserId();

    const declared = Number(req.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      throw new HttpError(413, "too_large", "File too large");
    }

    const limit = await getRateLimiter().hit(`upload:${userId}`, 30, 60);
    if (!limit.allowed) {
      throw new HttpError(429, "rate_limited", "Too many uploads", {
        "Retry-After": String(limit.retryAfterSec),
      });
    }

    const storage = getStorage();
    // Housekeeping: drop this user's abandoned (never sent) uploads.
    for (const key of await attachmentRepo.reapPendingAttachments(userId, PENDING_TTL_MS)) {
      await storage.delete(key).catch(() => {});
    }
    if ((await attachmentRepo.countPendingAttachments(userId)) >= MAX_PENDING_PER_USER) {
      throw new HttpError(429, "too_many_pending", "Too many unsent attachments");
    }

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new HttpError(422, "invalid_body", "Expected a file");
    if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "too_large", "File too large");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const filename = sanitizeFilename(file.name);
    const check = checkUpload(bytes, filename);
    if (!check.ok) {
      throw new HttpError(check.code === "too_large" ? 413 : 422, check.code, "File rejected");
    }

    const storageKey = await storage.put(bytes);
    try {
      const att = await attachmentRepo.createAttachment(userId, {
        filename,
        mime: check.file.mime,
        sizeBytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        storageKey,
      });
      return Response.json(
        { id: att.id, filename: att.filename, mime: att.mime, size_bytes: att.sizeBytes },
        { status: 201 },
      );
    } catch (e) {
      await storage.delete(storageKey).catch(() => {});
      throw e;
    }
  } catch (e) {
    return toResponse(e);
  }
}

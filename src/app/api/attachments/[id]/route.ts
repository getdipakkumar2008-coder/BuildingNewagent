import { z } from "zod";
import { HttpError, assertSameOrigin, requireUserId, toResponse } from "@/server/http";
import * as attachmentRepo from "@/server/repos/attachments";
import { getStorage } from "@/server/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

async function parseId(ctx: Ctx) {
  const id = z.uuid().safeParse((await ctx.params).id);
  if (!id.success) throw new HttpError(404, "not_found", "Not found");
  return id.data;
}

/** RFC 6266 / 5987 attachment disposition with an ASCII fallback; the name was sanitised at upload. */
function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** Owner-only download. Always a download (never inline), never sniffed, never cached. */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const userId = await requireUserId();
    const att = await attachmentRepo.getOwnAttachment(userId, await parseId(ctx));
    if (!att) throw new HttpError(404, "not_found", "Not found");
    const bytes = await getStorage().get(att.storageKey);
    if (!bytes) throw new HttpError(404, "not_found", "Not found");
    return new Response(bytes as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": att.mime === "text/plain" ? "text/plain; charset=utf-8" : att.mime,
        "Content-Length": String(bytes.length),
        "Content-Disposition": contentDisposition(att.filename),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return toResponse(e);
  }
}

/** Removes an unsent attachment. Sent ones are deleted with their conversation. */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    assertSameOrigin(req);
    const userId = await requireUserId();
    const res = await attachmentRepo.deletePendingAttachment(userId, await parseId(ctx));
    if (res.status === "not_found") throw new HttpError(404, "not_found", "Not found");
    if (res.status === "attached") {
      throw new HttpError(409, "already_sent", "This attachment belongs to a sent message");
    }
    await getStorage()
      .delete(res.storageKey)
      .catch(() => {});
    return new Response(null, { status: 204 });
  } catch (e) {
    return toResponse(e);
  }
}

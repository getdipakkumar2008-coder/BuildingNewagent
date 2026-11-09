import { z } from "zod";
import { isModelId } from "@/lib/models";
import { loadConversation } from "@/server/chat/service";
import { HttpError, assertSameOrigin, requireUserId, toResponse } from "@/server/http";
import * as attachmentRepo from "@/server/repos/attachments";
import * as repo from "@/server/repos/chat";
import { getStorage } from "@/server/storage";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const idSchema = z.uuid();

async function parseId(ctx: Ctx) {
  const id = idSchema.safeParse((await ctx.params).id);
  if (!id.success) throw new HttpError(404, "not_found", "Not found");
  return id.data;
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const userId = await requireUserId();
    const conv = await loadConversation(userId, await parseId(ctx));
    if (!conv) throw new HttpError(404, "not_found", "Not found");
    return Response.json(conv);
  } catch (e) {
    return toResponse(e);
  }
}

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  model: z.string().optional(),
  archived: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    assertSameOrigin(req);
    const userId = await requireUserId();
    const id = await parseId(ctx);
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(422, "invalid_body", "Invalid request body");
    if (parsed.data.model !== undefined && !isModelId(parsed.data.model)) {
      throw new HttpError(422, "invalid_model", "Unknown model");
    }
    if (!(await repo.updateConversation(userId, id, parsed.data))) {
      throw new HttpError(404, "not_found", "Not found");
    }
    return Response.json(await repo.ownConversation(userId, id));
  } catch (e) {
    return toResponse(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    assertSameOrigin(req);
    const userId = await requireUserId();
    const id = await parseId(ctx);
    // Collect file keys first: the rows disappear with the conversation (cascade).
    const keys = await attachmentRepo.storageKeysForConversation(userId, id);
    if (!(await repo.deleteConversation(userId, id))) {
      throw new HttpError(404, "not_found", "Not found");
    }
    // Hard delete: remove the bytes too. A failure is logged (orphaned objects are unreachable: no DB row).
    const storage = getStorage();
    await Promise.all(
      keys.map((k) =>
        storage.delete(k).catch((e) => {
          console.error(
            "[attachments] failed to delete object",
            e instanceof Error ? e.message : "unknown",
          );
        }),
      ),
    );
    return new Response(null, { status: 204 });
  } catch (e) {
    return toResponse(e);
  }
}

import { z } from "zod";
import { getChatDeps } from "@/server/chat/runtime";
import { startGeneration } from "@/server/chat/service";
import { sseResponse } from "@/server/chat/sse-response";
import { HttpError, assertSameOrigin, requireUserId, toResponse } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  content: z.string().min(1).max(100_000),
  // undefined → continue from the latest message; null → start a new root (edit of first message)
  parent_id: z.uuid().nullable().optional(),
  attachment_ids: z.array(z.uuid()).max(10).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const userId = await requireUserId();
    const id = z.uuid().safeParse((await ctx.params).id);
    if (!id.success) throw new HttpError(404, "not_found", "Not found");
    const body = bodySchema.safeParse(await req.json().catch(() => null));
    if (!body.success) throw new HttpError(422, "invalid_body", "Invalid request body");
    if (!body.data.content.trim()) throw new HttpError(422, "empty_message", "Message is empty");

    const gen = await startGeneration(getChatDeps(), {
      kind: "send",
      userId,
      conversationId: id.data,
      text: body.data.content,
      parentId: body.data.parent_id,
      attachmentIds: body.data.attachment_ids,
    });
    return sseResponse(gen);
  } catch (e) {
    return toResponse(e);
  }
}

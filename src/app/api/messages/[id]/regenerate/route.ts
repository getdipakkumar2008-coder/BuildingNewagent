import { z } from "zod";
import { getChatDeps } from "@/server/chat/runtime";
import { startGeneration } from "@/server/chat/service";
import { sseResponse } from "@/server/chat/sse-response";
import { HttpError, assertSameOrigin, requireUserId, toResponse } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const userId = await requireUserId();
    const id = z.uuid().safeParse((await ctx.params).id);
    if (!id.success) throw new HttpError(404, "not_found", "Not found");
    const gen = await startGeneration(getChatDeps(), {
      kind: "regenerate",
      userId,
      messageId: id.data,
    });
    return sseResponse(gen);
  } catch (e) {
    return toResponse(e);
  }
}

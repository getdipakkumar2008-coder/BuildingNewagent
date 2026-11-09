import { z } from "zod";
import { abortMessage } from "@/server/chat/service";
import { HttpError, assertSameOrigin, requireUserId, toResponse } from "@/server/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const userId = await requireUserId();
    const id = z.uuid().safeParse((await ctx.params).id);
    if (!id.success) throw new HttpError(404, "not_found", "Not found");
    // 202 whether or not it was still running; never reveal other users' message ids.
    abortMessage(userId, id.data);
    return new Response(null, { status: 202 });
  } catch (e) {
    return toResponse(e);
  }
}

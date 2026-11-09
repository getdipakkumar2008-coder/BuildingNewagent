import { z } from "zod";
import { DEFAULT_MODEL, isModelId } from "@/lib/models";
import { HttpError, assertSameOrigin, requireUserId, toResponse } from "@/server/http";
import * as repo from "@/server/repos/chat";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const q = new URL(req.url).searchParams.get("q");
    if (q !== null && q.length > 200) throw new HttpError(422, "invalid_query", "Query too long");
    const items = q?.trim()
      ? await repo.searchConversations(userId, q)
      : await repo.listConversations(userId);
    return Response.json({ items, next_cursor: null });
  } catch (e) {
    return toResponse(e);
  }
}

const createSchema = z.object({
  model: z.string().optional(),
  mode: z.enum(["chat", "research"]).optional(),
});

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const userId = await requireUserId();
    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new HttpError(422, "invalid_body", "Invalid request body");
    const model = parsed.data.model ?? DEFAULT_MODEL;
    if (!isModelId(model)) throw new HttpError(422, "invalid_model", "Unknown model");
    const conv = await repo.createConversation(userId, { model, mode: parsed.data.mode });
    return Response.json(conv, { status: 201 });
  } catch (e) {
    return toResponse(e);
  }
}

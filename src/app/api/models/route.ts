import { MODELS } from "@/lib/models";
import { requireUserId, toResponse } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUserId();
    return Response.json(MODELS.map((m) => ({ id: m.id, label: m.label })));
  } catch (e) {
    return toResponse(e);
  }
}

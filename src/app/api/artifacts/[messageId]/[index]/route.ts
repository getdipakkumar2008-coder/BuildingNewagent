import { z } from "zod";
import { ARTIFACT_CSP, buildArtifactDocument, extractArtifacts } from "@/lib/artifacts";
import { HttpError, requireUserId, toResponse } from "@/server/http";
import { ownedAssistantText } from "@/server/repos/chat";

export const dynamic = "force-dynamic";

/**
 * Serves ONE stored artifact as a sandboxed HTML document.
 * - Content comes from the message text in the database, addressed by (messageId, ordinal);
 *   the client never supplies the markup.
 * - Owner-only (session cookie is sent with the iframe navigation).
 * - The response CSP includes `sandbox allow-scripts` (opaque origin) and blocks all network access,
 *   so even direct navigation to this URL cannot reach cookies, storage or the network.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ messageId: string; index: string }> },
) {
  try {
    const userId = await requireUserId();
    const p = await ctx.params;
    const id = z.uuid().safeParse(p.messageId);
    const idx = z.coerce.number().int().min(0).max(99).safeParse(p.index);
    if (!id.success || !idx.success) throw new HttpError(404, "not_found", "Not found");

    const msg = await ownedAssistantText(userId, id.data);
    if (!msg) throw new HttpError(404, "not_found", "Not found");
    if (msg.status === "streaming")
      throw new HttpError(409, "still_streaming", "Message is still generating");

    const artifact = extractArtifacts(msg.text)[idx.data];
    if (!artifact) throw new HttpError(404, "not_found", "Not found");

    return new Response(buildArtifactDocument(artifact), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": ARTIFACT_CSP,
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    // This URL is loaded inside an iframe, so errors must be a readable HTML page, not raw JSON.
    if (e instanceof HttpError && e.status !== 401) return errorPage(e.status, MESSAGES[e.code]);
    if (e instanceof HttpError) return toResponse(e);
    console.error("[api] artifact error", e instanceof Error ? e.message : "unknown");
    return errorPage(500, "Something went wrong loading this preview.");
  }
}

const MESSAGES: Record<string, string> = {
  not_found: "This artifact is no longer available.",
  still_streaming: "This message is still generating. Try again when it has finished.",
};

function errorPage(status: number, message = "This preview could not be loaded.") {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:14px system-ui,sans-serif;margin:0;height:100vh;display:flex;align-items:center;justify-content:center;color:#444;background:#fff}</style></head><body><p>${message}</p></body></html>`;
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": ARTIFACT_CSP,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}

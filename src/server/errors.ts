/** RFC 9457 problem details response. */
export function problem(status: number, code: string, title: string, headers?: HeadersInit) {
  return new Response(JSON.stringify({ type: `about:blank`, title, status, code }), {
    status,
    headers: { "Content-Type": "application/problem+json", ...headers },
  });
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    title: string,
    public readonly headers?: HeadersInit,
  ) {
    super(title);
  }
}

export function toResponse(err: unknown): Response {
  if (err instanceof HttpError) return problem(err.status, err.code, err.message, err.headers);
  console.error("[api] unhandled error", err instanceof Error ? err.message : "unknown");
  return problem(500, "internal_error", "Internal error");
}

/** Required header on every state-changing request. Cross-origin pages cannot set it without CORS (we send none). */
export const CSRF_HEADER = "x-requested-with";
export const CSRF_VALUE = "deepresearchai";

/**
 * CSRF defence for non-GET requests: same-origin Origin header (when present) AND a custom header.
 * SameSite=Lax session cookie is the first layer; this is the second.
 */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin) {
    let ok = false;
    try {
      ok = new URL(origin).host === new URL(req.url).host;
    } catch {
      ok = false;
    }
    if (!ok) throw new HttpError(403, "csrf_origin", "Cross-origin request rejected");
  }
  if (req.headers.get(CSRF_HEADER) !== CSRF_VALUE) {
    throw new HttpError(403, "csrf_header", "Missing CSRF header");
  }
}

import { SseParser, type ChatEvent } from "@/lib/sse";

export const CSRF_HEADERS = { "X-Requested-With": "deepresearchai" } as const;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryAfterSec?: number,
  ) {
    super(message);
  }
}

/** Friendly text for stable error codes (server codes never carry raw upstream text). */
export function describeError(code: string, retryAfterSec?: number): string {
  switch (code) {
    case "rate_limited":
      return retryAfterSec
        ? `You're sending messages too quickly. Try again in ${retryAfterSec}s.`
        : "The service is rate limited. Try again shortly.";
    case "quota_exceeded":
      return "You've reached today's usage limit. Try again tomorrow.";
    case "too_many_streams":
      return "Two responses are already running. Wait for one to finish or stop it.";
    case "overloaded":
      return "The model is overloaded right now. Please retry.";
    case "llm_not_configured":
      return "The model isn't configured on this server yet.";
    case "unauthenticated":
      return "Your session expired. Sign in again.";
    default:
      return "Something went wrong. Please try again.";
  }
}

export async function jsonFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...CSRF_HEADERS, ...init.headers },
  });
  if (!res.ok) throw await toApiError(res);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

async function toApiError(res: Response): Promise<ApiError> {
  let code = "unknown";
  try {
    code = (await res.json()).code ?? code;
  } catch {
    /* non-JSON error body */
  }
  const ra = Number(res.headers.get("Retry-After"));
  return new ApiError(
    res.status,
    code,
    `HTTP ${res.status}`,
    Number.isFinite(ra) && ra > 0 ? ra : undefined,
  );
}

/** POSTs and consumes an SSE response, invoking `onEvent` per parsed event. */
export async function streamPost(
  url: string,
  body: unknown,
  signal: AbortSignal,
  onEvent: (ev: ChatEvent) => void,
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", ...CSRF_HEADERS },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await toApiError(res);
  if (!res.body) throw new ApiError(res.status, "no_body", "Empty response");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const ev of parser.push(decoder.decode(value, { stream: true }))) onEvent(ev);
  }
}

export type UploadedAttachment = { id: string; filename: string; mime: string; sizeBytes: number };

/** Uploads one file (multipart). The server decides the type from the bytes and may reject it. */
export async function uploadAttachment(
  file: File,
  signal?: AbortSignal,
): Promise<UploadedAttachment> {
  const form = new FormData();
  form.append("file", file);
  // No Content-Type header: the browser must set the multipart boundary itself.
  const res = await fetch("/api/attachments", {
    method: "POST",
    headers: CSRF_HEADERS,
    body: form,
    signal,
  });
  if (!res.ok) throw await toApiError(res);
  const j = (await res.json()) as {
    id: string;
    filename: string;
    mime: string;
    size_bytes: number;
  };
  return { id: j.id, filename: j.filename, mime: j.mime, sizeBytes: j.size_bytes };
}

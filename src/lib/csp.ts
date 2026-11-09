/** Builds the per-request Content-Security-Policy. Pure function so it can be unit-tested. */
export function buildCsp(nonce: string, isDev: boolean): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'strict-dynamic' lets nonce'd Next scripts load their chunks; no 'unsafe-inline' for scripts.
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    // Tailwind output is a stylesheet file; React/Next may emit inline style attributes.
    "style-src": ["'self'", ...(isDev ? ["'unsafe-inline'"] : [`'nonce-${nonce}'`])],
    // Inline style *attributes* (e.g. from next/image) cannot run script; <style> elements stay nonce-gated.
    "style-src-attr": ["'unsafe-inline'"],
    "img-src": ["'self'", "data:", "https://avatars.githubusercontent.com"],
    "font-src": ["'self'"],
    "connect-src": ["'self'"],
    // Same-origin frames only: the sandboxed artifact preview is served from /api/artifacts.
    "frame-src": ["'self'"],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");
}

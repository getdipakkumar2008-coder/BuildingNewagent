// Artifacts: complete ```html / ```svg fenced blocks in an assistant message that can be previewed.
// The SAME extraction runs on the server (to serve the preview from stored text) and on the client
// (to list them), so an artifact is addressed by (messageId, ordinal) and the browser never supplies
// the code that gets served.

export type ArtifactLanguage = "html" | "svg";

export type Artifact = {
  index: number;
  language: ArtifactLanguage;
  title: string;
  code: string;
};

const ARTIFACT_LANGS = new Set<string>(["html", "svg"]);
const MAX_ARTIFACT_BYTES = 512 * 1024;

/** Only COMPLETE (closed) fences count, so a half-streamed block never becomes an artifact. */
export function extractArtifacts(markdown: string): Artifact[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: Artifact[] = [];
  let i = 0;
  while (i < lines.length) {
    // Backtick fences may not have a backtick in the info string; tilde fences may (CommonMark).
    const open = lines[i]!.match(/^ {0,3}(?:(`{3,})\s*([^\s`]*)[^`]*|(~{3,})\s*(\S*).*)$/);
    if (!open) {
      i += 1;
      continue;
    }
    const fenceRun = (open[1] ?? open[3])!;
    const char = fenceRun[0]!;
    const len = fenceRun.length;
    const lang = (open[2] ?? open[4] ?? "").toLowerCase();
    const body: string[] = [];
    let closed = false;
    let j = i + 1;
    for (; j < lines.length; j++) {
      const close = lines[j]!.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (close && close[1]![0] === char && close[1]!.length >= len) {
        closed = true;
        break;
      }
      body.push(lines[j]!);
    }
    if (closed && ARTIFACT_LANGS.has(lang)) {
      const code = body.join("\n");
      if (code.trim() !== "" && utf8Length(code) <= MAX_ARTIFACT_BYTES) {
        out.push({
          index: out.length,
          language: lang as ArtifactLanguage,
          title: titleOf(lang as ArtifactLanguage, code, out.length),
          code,
        });
      }
    }
    i = closed ? j + 1 : lines.length; // an unclosed fence swallows the rest of the message
  }
  return out;
}

const encoder = new TextEncoder();
function utf8Length(s: string): number {
  return encoder.encode(s).length;
}

function titleOf(language: ArtifactLanguage, code: string, index: number): string {
  const m = code.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const raw = m?.[1]?.replace(/\s+/g, " ").trim();
  if (raw) return raw.length > 80 ? `${raw.slice(0, 79)}…` : raw;
  return language === "svg" ? `SVG image ${index + 1}` : `HTML page ${index + 1}`;
}

/** The document served inside the sandboxed iframe. */
export function buildArtifactDocument(a: Pick<Artifact, "language" | "code">): string {
  if (a.language === "svg") {
    // The HTML parser would turn an XML prolog / DOCTYPE into bogus comments; drop them (inline SVG
    // inside HTML already supports CDATA and namespaces).
    const svg = a.code.replace(/^\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!DOCTYPE[^>]*>\s*)?/i, "");
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%}body{display:flex;align-items:center;justify-content:center;background:#fff}svg{max-width:100%;max-height:100%}</style></head><body>${svg}</body></html>`;
  }
  if (/<html[\s>]/i.test(a.code)) return a.code;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${a.code}</body></html>`;
}

/**
 * Response CSP for artifact documents. `sandbox allow-scripts` (no allow-same-origin) gives the
 * document an opaque origin even if opened directly; everything that could leave the page is blocked.
 */
export const ARTIFACT_CSP = [
  "sandbox allow-scripts",
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "font-src data:",
  "media-src data:",
  "connect-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
].join("; ");

/** The exact `sandbox` attribute for the preview iframe. Deliberately omits allow-same-origin. */
export const ARTIFACT_IFRAME_SANDBOX = "allow-scripts";

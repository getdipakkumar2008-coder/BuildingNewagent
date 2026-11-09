// Upload validation shared by the server routes and unit tests. Pure functions, no I/O.
// The stored MIME type comes from the file's BYTES (magic numbers), never from the client's
// Content-Type or the filename extension. Anything not on the allow-list is rejected.

export const MAX_FILES_PER_MESSAGE = 10;

export type AttachmentKind = "image" | "pdf" | "text";

export type SniffedFile = { mime: string; kind: AttachmentKind };

export const SIZE_LIMITS: Record<AttachmentKind, number> = {
  image: 5 * 1024 * 1024, // upstream per-image limit
  pdf: 20 * 1024 * 1024,
  text: 1024 * 1024, // text is inlined into the prompt, so keep token cost bounded
};

/** Largest accepted upload overall; used to reject oversized bodies early. */
export const MAX_UPLOAD_BYTES = SIZE_LIMITS.pdf;

const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "csv", "json", "log"]);

export type UploadError =
  "empty_file" | "too_large" | "unsupported_type" | "invalid_text" | "mismatched_type";

export type UploadCheck = { ok: true; file: SniffedFile } | { ok: false; code: UploadError };

const startsWith = (b: Uint8Array, sig: number[], offset = 0) =>
  b.length >= offset + sig.length && sig.every((v, i) => b[offset + i] === v);

function sniffBinary(b: Uint8Array): SniffedFile | null {
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mime: "image/png", kind: "image" };
  }
  if (startsWith(b, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", kind: "image" };
  if (
    startsWith(b, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    startsWith(b, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  ) {
    return { mime: "image/gif", kind: "image" };
  }
  if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8)) {
    return { mime: "image/webp", kind: "image" };
  }
  // The PDF spec tolerates junk before the header; we require it at offset 0 and fail closed otherwise.
  if (startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d]))
    return { mime: "application/pdf", kind: "pdf" };
  return null;
}

/** Strict UTF-8 text check: valid encoding, no NUL bytes, no other C0 controls except \t \n \r \f. */
export function isPlainText(b: Uint8Array): boolean {
  let s: string;
  try {
    s = new TextDecoder("utf-8", { fatal: true }).decode(b);
  } catch {
    return false;
  }
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d && c !== 0x0c) return false;
  }
  return true;
}

export function extensionOf(filename: string): string {
  const m = /\.([A-Za-z0-9]{1,10})$/.exec(filename.trim());
  return m ? m[1]!.toLowerCase() : "";
}

/** Classifies bytes against the allow-list. `filename` is only used to allow plain-text files. */
export function checkUpload(bytes: Uint8Array, filename: string): UploadCheck {
  if (bytes.length === 0) return { ok: false, code: "empty_file" };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, code: "too_large" };

  const bin = sniffBinary(bytes);
  if (bin) {
    // A name that claims a text type but whose bytes are binary is rejected, not silently retyped.
    if (TEXT_EXTENSIONS.has(extensionOf(filename))) return { ok: false, code: "mismatched_type" };
    if (bytes.length > SIZE_LIMITS[bin.kind]) return { ok: false, code: "too_large" };
    return { ok: true, file: bin };
  }

  if (TEXT_EXTENSIONS.has(extensionOf(filename))) {
    if (bytes.length > SIZE_LIMITS.text) return { ok: false, code: "too_large" };
    if (!isPlainText(bytes)) return { ok: false, code: "invalid_text" };
    return { ok: true, file: { mime: "text/plain", kind: "text" } };
  }
  return { ok: false, code: "unsupported_type" };
}

/** Display-safe filename: no path parts, no control or bidi-override characters, bounded length. */
export function sanitizeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  const name = cleaned || "file";
  if (name.length <= 120) return name;
  const ext = extensionOf(name);
  const keep = 120 - (ext ? ext.length + 1 : 0);
  return ext ? `${name.slice(0, keep)}.${ext}` : name.slice(0, 120);
}

export const UPLOAD_ERROR_MESSAGES: Record<string, string> = {
  empty_file: "That file is empty.",
  too_large: "That file is too large.",
  unsupported_type: "That file type isn't supported. Use PDF, PNG, JPEG, GIF, WebP, or text files.",
  invalid_text: "That text file isn't valid UTF-8 text.",
  mismatched_type: "The file's contents don't match its name.",
  rate_limited: "You're uploading too quickly. Try again shortly.",
  too_many_files: "You can attach up to 10 files per message.",
};

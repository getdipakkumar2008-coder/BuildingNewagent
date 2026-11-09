import type { LlmBlock } from "@/server/llm/types";

/** Total raw attachment bytes sent to the model per request (upstream request size is bounded). */
export const ATTACHMENT_BYTES_BUDGET = 24 * 1024 * 1024;

export type LoadedAttachment = { filename: string; mime: string; bytes: Uint8Array };

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function escapeAttr(s: string): string {
  return s.replace(
    /[&"<>]/g,
    (c) => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" })[c]!,
  );
}

/**
 * Wraps an uploaded text file as DATA. The closing tag is neutralised inside the body so the file cannot
 * end the wrapper early; the system prompt tells the model that nothing inside is an instruction (ADR-008).
 */
export function wrapTextFile(filename: string, text: string): string {
  const body = text.replace(/<\/attached_file/gi, "<\\/attached_file");
  return `<attached_file name="${escapeAttr(filename)}" trust="untrusted-user-data">\n${body}\n</attached_file>`;
}

export function omittedNote(filename: string): string {
  return `[Attachment "${filename}" was left out because the conversation's attachment size limit was reached.]`;
}

export function blockFor(a: LoadedAttachment): LlmBlock {
  if (a.mime === "application/pdf") {
    return {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: Buffer.from(a.bytes).toString("base64"),
      },
    };
  }
  if (IMAGE_MIMES.has(a.mime)) {
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: a.mime as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: Buffer.from(a.bytes).toString("base64"),
      },
    };
  }
  return { type: "text", text: wrapTextFile(a.filename, new TextDecoder().decode(a.bytes)) };
}

/** Attachments first, then the user's text (the recommended order for documents and images). */
export function buildUserContent(
  text: string,
  attachments: (LoadedAttachment | string)[],
): string | LlmBlock[] {
  if (attachments.length === 0) return text;
  const blocks: LlmBlock[] = attachments.map((a) =>
    typeof a === "string" ? { type: "text", text: a } : blockFor(a),
  );
  blocks.push({ type: "text", text });
  return blocks;
}

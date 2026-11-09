"use client";

import { AlertCircle, FileText, Image as ImageIcon, Loader2, X } from "lucide-react";

export type AttachmentView = { id: string; filename: string; mime: string; sizeBytes: number };

export type PendingFile = {
  key: string;
  name: string;
  status: "uploading" | "ready" | "error";
  attachment?: AttachmentView;
  error?: string;
};

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const Icon = ({ mime }: { mime: string }) =>
  mime.startsWith("image/") ? (
    <ImageIcon size={14} aria-hidden />
  ) : (
    <FileText size={14} aria-hidden />
  );

/** Files already sent with a message: each one downloads through the authenticated route. */
export function SentAttachments({ items }: { items: AttachmentView[] }) {
  if (items.length === 0) return null;
  return (
    <ul aria-label="Attachments" className="mb-1 flex flex-wrap justify-end gap-2">
      {items.map((a) => (
        <li key={a.id}>
          <a
            href={`/api/attachments/${a.id}`}
            download={a.filename}
            className="flex items-center gap-1.5 rounded-ui border border-border bg-surface px-2 py-1 text-xs hover:bg-surface-2"
          >
            <Icon mime={a.mime} />
            <span className="max-w-[12rem] truncate">{a.filename}</span>
            <span className="text-muted">{formatBytes(a.sizeBytes)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Files chosen in the composer but not yet sent. */
export function PendingAttachments({
  items,
  onRemove,
}: {
  items: PendingFile[];
  onRemove: (key: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <ul aria-label="Files to attach" className="mb-2 flex flex-wrap gap-2">
      {items.map((f) => (
        <li
          key={f.key}
          data-status={f.status}
          className={`flex items-center gap-1.5 rounded-ui border px-2 py-1 text-xs ${
            f.status === "error" ? "border-danger" : "border-border"
          }`}
        >
          {f.status === "uploading" ? (
            <Loader2 size={14} aria-hidden className="animate-spin" />
          ) : f.status === "error" ? (
            <AlertCircle size={14} aria-hidden className="text-danger" />
          ) : (
            <Icon mime={f.attachment?.mime ?? ""} />
          )}
          <span className="max-w-[12rem] truncate">{f.name}</span>
          {f.status === "uploading" && <span className="text-muted">Uploading…</span>}
          {f.status === "ready" && f.attachment && (
            <span className="text-muted">{formatBytes(f.attachment.sizeBytes)}</span>
          )}
          {f.status === "error" && <span className="text-danger">{f.error}</span>}
          <button
            type="button"
            aria-label={`Remove ${f.name}`}
            onClick={() => onRemove(f.key)}
            className="rounded p-0.5 text-muted hover:bg-surface-2 hover:text-fg"
          >
            <X size={12} aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}

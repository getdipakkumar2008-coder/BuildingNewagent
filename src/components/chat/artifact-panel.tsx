"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { ARTIFACT_IFRAME_SANDBOX, type Artifact } from "@/lib/artifacts";

export type OpenArtifact = Artifact & { messageId: string };

type Props = { artifact: OpenArtifact; onClose: () => void };

/**
 * Side panel with Preview and Code tabs.
 * The preview is an iframe pointing at /api/artifacts/<message>/<ordinal>: the server serves the stored
 * markup with a sandboxing CSP. The iframe is sandboxed WITHOUT allow-same-origin, so the artifact gets an
 * opaque origin and cannot touch this page's cookies, storage or DOM.
 */
export function ArtifactPanel({ artifact, onClose }: Props) {
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => closeRef.current?.focus(), [artifact.messageId, artifact.index]);
  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(artifact.code);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <aside
      aria-label="Artifact preview"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      className="fixed inset-0 z-40 flex flex-col bg-surface lg:static lg:z-auto lg:w-[min(48%,720px)] lg:shrink-0 lg:border-l lg:border-border"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="truncate text-sm font-semibold" title={artifact.title}>
          {artifact.title}
        </h2>
        <div className="flex items-center gap-1">
          <div
            role="tablist"
            aria-label="Artifact view"
            className="flex rounded-ui border border-border p-0.5 text-sm"
          >
            {(["preview", "code"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                id={`artifact-tab-${t}`}
                aria-selected={tab === t}
                aria-controls="artifact-body"
                onClick={() => setTab(t)}
                className={`rounded px-3 py-1 capitalize ${tab === t ? "bg-brand text-brand-contrast" : "hover:bg-surface-2"}`}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close artifact panel"
            className="rounded-ui p-2 hover:bg-surface-2"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
      </div>

      <div
        id="artifact-body"
        role="tabpanel"
        aria-labelledby={`artifact-tab-${tab}`}
        className="min-h-0 flex-1"
      >
        {tab === "preview" ? (
          <iframe
            key={`${artifact.messageId}-${artifact.index}`}
            title={`Preview of ${artifact.title}`}
            src={`/api/artifacts/${artifact.messageId}/${artifact.index}`}
            sandbox={ARTIFACT_IFRAME_SANDBOX}
            referrerPolicy="no-referrer"
            loading="lazy"
            className="h-full w-full bg-white"
          />
        ) : (
          <div className="relative h-full overflow-auto">
            <button
              onClick={copy}
              aria-label={copied ? "Copied" : "Copy artifact code"}
              className="absolute right-2 top-2 flex items-center gap-1 rounded-ui border border-border bg-surface px-2 py-1 text-xs hover:bg-surface-2"
            >
              {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </button>
            <pre tabIndex={0} aria-label="Artifact source" className="p-4 text-sm leading-relaxed">
              <code className="font-mono">{artifact.code}</code>
            </pre>
          </div>
        )}
      </div>
    </aside>
  );
}

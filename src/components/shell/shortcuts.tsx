"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Keyboard } from "lucide-react";

// Deliberately avoids Shift+Alt (reserved by screen readers on some platforms) and single-letter
// shortcuts while typing. Shown in the help dialog, which is the single source of truth.
export const SHORTCUTS = [
  { keys: "Ctrl/⌘ + Shift + O", action: "Start a new chat" },
  { keys: "/", action: "Focus the message box" },
  { keys: "?", action: "Show this list" },
  { keys: "Enter · Shift + Enter", action: "Send · new line" },
  { keys: "Esc", action: "Stop generating, or close the artifact panel" },
] as const;

function isEditable(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
}

export function ShortcutsButtonAndHandler() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey && !e.altKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        router.push("/new");
        return;
      }
      if (mod || e.altKey || isEditable(e.target)) return; // never hijack typing
      if (e.key === "/") {
        const box = document.getElementById("composer");
        if (box) {
          e.preventDefault();
          box.focus();
        }
      } else if (e.key === "?") {
        e.preventDefault();
        dialog.current?.showModal();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <>
      <button
        onClick={() => dialog.current?.showModal()}
        aria-label="Keyboard shortcuts"
        className="rounded-ui p-2 hover:bg-surface-2"
      >
        <Keyboard size={18} aria-hidden />
      </button>
      {/* Native <dialog>: focus trap, Esc to close and focus restore come from the platform. */}
      <dialog
        ref={dialog}
        aria-labelledby="shortcuts-title"
        className="m-auto w-[min(92vw,28rem)] rounded-ui border border-border bg-surface p-5 text-fg backdrop:bg-black/50"
      >
        <h2 id="shortcuts-title" className="mb-3 text-lg font-semibold">
          Keyboard shortcuts
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="contents">
              <dt className="font-mono text-muted">{s.keys}</dt>
              <dd>{s.action}</dd>
            </div>
          ))}
        </dl>
        <form method="dialog" className="mt-4 text-right">
          <button className="rounded-ui bg-brand px-3 py-1 text-sm text-brand-contrast">
            Close
          </button>
        </form>
      </dialog>
    </>
  );
}

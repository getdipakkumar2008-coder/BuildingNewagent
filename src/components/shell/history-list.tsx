"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, Pencil, Search, Trash2, X } from "lucide-react";
import { jsonFetch } from "@/lib/chat-client";

export type HistoryItem = { id: string; title: string };

type Props = {
  conversations: HistoryItem[];
  /** Called after a rename/delete so the owner can refresh its list. */
  onChanged: () => void | Promise<void>;
  onNavigate: () => void;
};

/**
 * Sidebar history with search, inline rename and two-step delete.
 * Uses no browser dialogs: delete asks for confirmation inline.
 */
export function HistoryList({ conversations, onChanged, onNavigate }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HistoryItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);
  const searchSeq = useRef(0);

  // Debounced server-side search; stale responses are ignored.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      searchSeq.current += 1;
      return;
    }
    const seq = ++searchSeq.current;
    const t = setTimeout(async () => {
      try {
        const data = await jsonFetch<{ items: HistoryItem[] }>(
          `/api/conversations?q=${encodeURIComponent(q)}`,
        );
        if (seq !== searchSeq.current) return;
        const items = data.items.map((c) => ({ id: c.id, title: c.title }));
        setResults(items);
        setStatus(`${items.length} ${items.length === 1 ? "chat" : "chats"} found`);
      } catch {
        if (seq !== searchSeq.current) return;
        setResults([]);
        setStatus("Search failed. Try again.");
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (editing) renameRef.current?.select();
  }, [editing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Typing and clearing update these directly (not from an effect) so renders never cascade.
  function updateQuery(v: string) {
    setQuery(v);
    if (v.trim()) {
      setSearching(true);
    } else {
      setSearching(false);
      setResults(null);
    }
  }

  const shown = results ?? conversations;

  async function saveRename() {
    if (!editing) return;
    const title = editing.title.trim();
    const current = shown.find((c) => c.id === editing.id);
    setEditing(null);
    if (!title || title === current?.title) return;
    try {
      await jsonFetch(`/api/conversations/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      });
      setResults((r) => r && r.map((c) => (c.id === editing.id ? { ...c, title } : c)));
      setStatus("Chat renamed");
      await onChanged();
    } catch {
      setStatus("Could not rename the chat");
    }
  }

  async function remove(id: string) {
    setConfirmId(null);
    try {
      await jsonFetch(`/api/conversations/${id}`, { method: "DELETE" });
      setResults((r) => r && r.filter((c) => c.id !== id));
      setStatus("Chat deleted");
      await onChanged();
      if (pathname === `/c/${id}`) router.push("/new");
    } catch {
      setStatus("Could not delete the chat");
    }
  }

  const iconBtn =
    "rounded-ui p-1.5 text-muted hover:bg-surface-2 hover:text-fg focus-visible:opacity-100";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 pb-2">
        <label className="relative block">
          <span className="sr-only">Search chats</span>
          <Search
            size={14}
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => updateQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.stopPropagation();
                updateQuery("");
              }
            }}
            placeholder="Search chats"
            maxLength={200}
            className="w-full rounded-ui border border-border bg-surface py-1.5 pl-8 pr-2 text-sm"
          />
        </label>
      </div>

      <nav aria-label="Chat history" className="flex-1 overflow-y-auto px-3 pb-3">
        {shown.length === 0 ? (
          <p className="px-1 text-sm text-muted">
            {results !== null
              ? "No chats match your search."
              : searching
                ? "Searching…"
                : "No conversations yet."}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {shown.map((c) => {
              const href = `/c/${c.id}`;
              const active = pathname === href;
              const isEditing = editing?.id === c.id;
              const isConfirming = confirmId === c.id;
              return (
                <li key={c.id} className="group relative">
                  {isEditing ? (
                    <form
                      className="flex items-center gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void saveRename();
                      }}
                    >
                      <input
                        ref={renameRef}
                        aria-label={`Rename chat ${c.title}`}
                        value={editing.title}
                        maxLength={200}
                        onChange={(e) => setEditing({ id: c.id, title: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.stopPropagation();
                            setEditing(null);
                          }
                        }}
                        className="min-w-0 flex-1 rounded-ui border border-border bg-surface px-2 py-1 text-sm"
                      />
                      <button type="submit" aria-label="Save name" className={iconBtn}>
                        <Check size={14} aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label="Cancel rename"
                        className={iconBtn}
                        onClick={() => setEditing(null)}
                      >
                        <X size={14} aria-hidden />
                      </button>
                    </form>
                  ) : isConfirming ? (
                    <div
                      role="group"
                      aria-label={`Confirm delete ${c.title}`}
                      className="flex items-center justify-between gap-1 rounded-ui bg-surface-2 px-2 py-1.5 text-sm"
                    >
                      <span>Delete this chat?</span>
                      <span className="flex gap-1">
                        <button
                          autoFocus
                          className="rounded-ui border border-danger px-2 py-0.5 text-xs font-medium text-danger"
                          onClick={() => void remove(c.id)}
                        >
                          Delete
                        </button>
                        <button
                          className="rounded-ui border border-border px-2 py-0.5 text-xs"
                          onClick={() => setConfirmId(null)}
                        >
                          Cancel
                        </button>
                      </span>
                    </div>
                  ) : (
                    <>
                      <Link
                        href={href}
                        aria-current={active ? "page" : undefined}
                        onClick={onNavigate}
                        className={`block truncate rounded-ui py-2 pl-3 pr-16 text-sm hover:bg-surface-2 ${
                          active ? "bg-surface-2 font-medium" : ""
                        }`}
                        title={c.title}
                      >
                        {c.title}
                      </Link>
                      <span className="absolute right-1 top-1/2 flex -translate-y-1/2 opacity-0 focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
                        <button
                          aria-label={`Rename chat ${c.title}`}
                          className={iconBtn}
                          onClick={() => setEditing({ id: c.id, title: c.title })}
                        >
                          <Pencil size={14} aria-hidden />
                        </button>
                        <button
                          aria-label={`Delete chat ${c.title}`}
                          className={iconBtn}
                          onClick={() => setConfirmId(c.id)}
                        >
                          <Trash2 size={14} aria-hidden />
                        </button>
                      </span>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </nav>
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
    </div>
  );
}

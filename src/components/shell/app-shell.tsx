"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu, PanelLeftClose, SquarePen } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { signOutAction } from "./actions";
import { HistoryContext } from "./history-context";
import { ShortcutsButtonAndHandler } from "./shortcuts";
import { HistoryList } from "./history-list";

type Props = {
  conversations: { id: string; title: string }[];
  user: { name: string | null; email: string | null };
  theme: "light" | "dark";
  children: React.ReactNode;
};

export function AppShell({ user, theme, conversations: initialConversations, children }: Props) {
  const [conversations, setConversations] = useState(initialConversations);
  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      if (res.ok) {
        const data = (await res.json()) as { items: { id: string; title: string }[] };
        setConversations(data.items.map((c) => ({ id: c.id, title: c.title })));
      }
    } catch {
      /* sidebar stays as-is; next navigation refreshes it */
    }
  }, []);
  const [open, setOpen] = useState(false);
  const label = user.name ?? user.email ?? "Account";

  return (
    <HistoryContext.Provider value={{ reload }}>
      <div className="flex h-dvh">
        {open && (
          <button
            aria-label="Close sidebar backdrop"
            className="fixed inset-0 z-20 bg-black/40 md:hidden"
            onClick={() => setOpen(false)}
          />
        )}

        <aside
          id="sidebar"
          aria-label="Sidebar"
          className={`fixed inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-border bg-surface transition-transform md:static md:translate-x-0 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between gap-2 p-3">
            <Link href="/new" className="flex items-center gap-2 font-semibold">
              <Image src="/logo.svg" alt="" width={28} height={28} />
              DeepResearchAI
            </Link>
            <button
              aria-label="Close sidebar"
              className="rounded-ui p-2 hover:bg-surface-2 md:hidden"
              onClick={() => setOpen(false)}
            >
              <PanelLeftClose size={18} aria-hidden />
            </button>
          </div>

          <div className="px-3">
            <Link
              href="/new"
              className="flex items-center gap-2 rounded-ui border border-border px-3 py-2 hover:bg-surface-2"
            >
              <SquarePen size={16} aria-hidden /> New chat
            </Link>
          </div>

          <div className="h-3" />
          <HistoryList
            conversations={conversations}
            onChanged={reload}
            onNavigate={() => setOpen(false)}
          />

          <div className="flex items-center justify-between gap-2 border-t border-border p-3">
            <span className="truncate text-sm" title={label}>
              {label}
            </span>
            <form action={signOutAction}>
              <button className="rounded-ui px-2 py-1 text-sm text-muted hover:bg-surface-2 hover:text-fg">
                Sign out
              </button>
            </form>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <button
              aria-label="Open sidebar"
              aria-controls="sidebar"
              aria-expanded={open}
              className="rounded-ui p-2 hover:bg-surface-2 md:hidden"
              onClick={() => setOpen(true)}
            >
              <Menu size={18} aria-hidden />
            </button>
            <div className="ml-auto flex items-center gap-1">
              <ShortcutsButtonAndHandler />
              <ThemeToggle initialTheme={theme} />
            </div>
          </header>
          <main id="main" className="min-h-0 flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </HistoryContext.Provider>
  );
}

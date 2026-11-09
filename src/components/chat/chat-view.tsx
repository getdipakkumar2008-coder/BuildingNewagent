"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppWindow,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Paperclip,
  Pencil,
  RefreshCw,
  Square,
} from "lucide-react";
import { activePath, newestLeafUnder, siblingsOf } from "@/lib/chat-tree";
import {
  ApiError,
  CSRF_HEADERS,
  describeError,
  jsonFetch,
  streamPost,
  uploadAttachment,
} from "@/lib/chat-client";
import { MAX_FILES_PER_MESSAGE, MAX_UPLOAD_BYTES, UPLOAD_ERROR_MESSAGES } from "@/lib/uploads";
import {
  PendingAttachments,
  SentAttachments,
  type AttachmentView,
  type PendingFile,
} from "@/components/chat/attachment-chips";
import type { ChatEvent } from "@/lib/sse";
import { extractArtifacts } from "@/lib/artifacts";
import { Markdown } from "@/components/chat/markdown";
import { ArtifactPanel, type OpenArtifact } from "@/components/chat/artifact-panel";
import { useHistoryReload } from "@/components/shell/history-context";

export type ClientMessage = {
  id: string;
  parentId: string | null;
  role: "user" | "assistant";
  text: string;
  status: "complete" | "streaming" | "stopped" | "error";
  createdAt: string;
  attachments?: AttachmentView[];
};

type Props = {
  conversationId: string | null;
  initialMessages: ClientMessage[];
  initialModel: string;
  models: { id: string; label: string }[];
};

let tempCounter = 0;
const tempId = (p: string) => `${p}-${++tempCounter}`;

export function ChatView({ conversationId, initialMessages, initialModel, models }: Props) {
  const reloadHistory = useHistoryReload();
  const [convId, setConvId] = useState(conversationId);
  const [messages, setMessages] = useState<ClientMessage[]>(initialMessages);
  const [leafId, setLeafId] = useState<string | null>(null);
  const [model, setModel] = useState(initialModel);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [announce, setAnnounce] = useState("");
  const [openRef, setOpenArtifact] = useState<OpenArtifact | null>(null);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const path = useMemo(() => activePath(messages, leafId), [messages, leafId]);

  // The open artifact is re-derived from the CURRENT active path, so switching branch/version or
  // editing the message can never leave the panel showing a stale snapshot.
  const openArtifact = useMemo<OpenArtifact | null>(() => {
    if (!openRef) return null;
    const msg = path.find((m) => m.id === openRef.messageId);
    if (!msg || msg.status === "streaming") return null;
    const fresh = extractArtifacts(msg.text)[openRef.index];
    return fresh ? { ...fresh, messageId: msg.id } : null;
  }, [openRef, path]);

  useEffect(() => inputRef.current?.focus(), []);

  // Keep the newest text in view unless the user scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [path]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const patchMessage = useCallback((id: string, patch: Partial<ClientMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  /** Runs one generation: optimistic placeholders → stream → reconcile ids. */
  const run = useCallback(
    async (opts: {
      url: string;
      body?: unknown;
      userText?: string; // present for "send"
      userAttachments?: AttachmentView[]; // shown on the optimistic user message
      parentId: string | null; // parent of the new user msg (send) or of the new assistant (regenerate)
    }) => {
      setError(null);
      setStreaming(true);
      stickToBottom.current = true;
      const controller = new AbortController();
      abortRef.current = controller;

      const now = new Date().toISOString();
      let userTemp: string | null = null;
      if (opts.userText !== undefined) {
        userTemp = tempId("u");
        setMessages((p) => [
          ...p,
          {
            id: userTemp!,
            parentId: opts.parentId,
            role: "user",
            text: opts.userText!,
            status: "complete",
            createdAt: now,
            attachments: opts.userAttachments,
          },
        ]);
      }
      let assistantId = tempId("a");
      const assistantParent = userTemp ?? opts.parentId;
      setMessages((p) => [
        ...p,
        {
          id: assistantId,
          parentId: assistantParent,
          role: "assistant",
          text: "",
          status: "streaming",
          createdAt: now,
        },
      ]);
      setLeafId(assistantId);
      setAnnounce("Generating response…");

      // Batch text deltas to one state update per animation frame (many tokens/second otherwise
      // re-render the message hundreds of times). Flushed synchronously before any status change.
      let pending = "";
      let raf: number | null = null;
      const flushPending = () => {
        if (raf !== null) {
          cancelAnimationFrame(raf);
          raf = null;
        }
        if (!pending) return;
        const chunk = pending;
        pending = "";
        const target = assistantId; // value captured now; never read inside the updater
        setMessages((p) => p.map((m) => (m.id === target ? { ...m, text: m.text + chunk } : m)));
      };

      const handle = (ev: ChatEvent) => {
        if (ev.event === "message.start") {
          // Capture ids as constants: React runs updater functions later, after `assistantId`
          // has been reassigned below, so the updaters must not read the mutable variable.
          const tempAssistant = assistantId;
          const realAssistant = ev.data.message_id;
          const realUser = ev.data.user_message_id;
          setMessages((p) =>
            p.map((m) => {
              if (userTemp && m.id === userTemp) return { ...m, id: realUser };
              if (m.id === tempAssistant) return { ...m, id: realAssistant, parentId: realUser };
              return m;
            }),
          );
          assistantId = realAssistant;
          activeMessageId.current = realAssistant;
          setLeafId(realAssistant);
        } else if (ev.event === "text.delta") {
          pending += ev.data.text;
          if (raf === null) raf = requestAnimationFrame(flushPending);
        } else if (ev.event === "message.stop") {
          flushPending();
          patchMessage(assistantId, { status: ev.data.status });
        } else if (ev.event === "error") {
          flushPending();
          patchMessage(assistantId, { status: "error" });
          setError(describeError(ev.data.code));
        }
      };

      try {
        await streamPost(opts.url, opts.body, controller.signal, handle);
        setAnnounce("Response complete.");
      } catch (e) {
        flushPending();
        if (controller.signal.aborted) {
          patchMessage(assistantId, { status: "stopped" });
          setAnnounce("Generation stopped.");
        } else {
          // Pre-stream failure (HTTP error) or network loss: drop the empty placeholder.
          const err = e instanceof ApiError ? e : null;
          setError(describeError(err?.code ?? "network", err?.retryAfterSec));
          setMessages((p) => p.filter((m) => !(m.id === assistantId && m.text === "")));
          setAnnounce("");
        }
      } finally {
        flushPending();
        abortRef.current = null;
        activeMessageId.current = null;
        setStreaming(false);
        void reloadHistory(); // refresh the sidebar (title / ordering) without remounting
        inputRef.current?.focus();
      }
    },
    [patchMessage, reloadHistory],
  );

  const ensureConversation = useCallback(async (): Promise<string> => {
    if (convId) return convId;
    const conv = await jsonFetch<{ id: string }>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ model }),
    });
    setConvId(conv.id);
    // Update the URL in place. Next syncs history.replaceState with its router (usePathname
    // updates) WITHOUT switching pages, so this component keeps its live state. Do not use
    // router.replace/refresh here: those render /c/[id] as a different page and remount.
    window.history.replaceState(null, "", `/c/${conv.id}`);
    return conv.id;
  }, [convId, model]);

  const send = useCallback(
    async (text: string, parentId: string | null, attached: AttachmentView[] = []) => {
      let id: string;
      try {
        id = await ensureConversation();
      } catch (e) {
        const err = e instanceof ApiError ? e : null;
        setError(describeError(err?.code ?? "network", err?.retryAfterSec));
        return;
      }
      await run({
        url: `/api/conversations/${id}/messages`,
        body: {
          content: text,
          parent_id: parentId,
          ...(attached.length > 0 ? { attachment_ids: attached.map((a) => a.id) } : {}),
        },
        userText: text,
        userAttachments: attached,
        parentId,
      });
    },
    [ensureConversation, run],
  );

  const uploading = files.some((f) => f.status === "uploading");
  const readyFiles = files.flatMap((f) =>
    f.status === "ready" && f.attachment ? [f.attachment] : [],
  );

  const submit = () => {
    const text = draft.trim();
    if (!text || streaming || uploading) return;
    setDraft("");
    setFiles([]);
    void send(text, path.at(-1)?.id ?? null, readyFiles);
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const chosen = Array.from(list);
    const room = MAX_FILES_PER_MESSAGE - files.length;
    const accepted = chosen.slice(0, Math.max(room, 0));
    if (chosen.length > accepted.length) setError(UPLOAD_ERROR_MESSAGES.too_many_files!);
    for (const file of accepted) {
      const key = `f-${++tempCounter}`;
      if (file.size > MAX_UPLOAD_BYTES) {
        setFiles((p) => [
          ...p,
          { key, name: file.name, status: "error", error: UPLOAD_ERROR_MESSAGES.too_large },
        ]);
        continue;
      }
      setFiles((p) => [...p, { key, name: file.name, status: "uploading" }]);
      uploadAttachment(file)
        .then((att) =>
          setFiles((p) =>
            p.map((f) => (f.key === key ? { ...f, status: "ready", attachment: att } : f)),
          ),
        )
        .catch((e) => {
          const code = e instanceof ApiError ? e.code : "network";
          const msg = UPLOAD_ERROR_MESSAGES[code] ?? "Upload failed. Try again.";
          setFiles((p) =>
            p.map((f) => (f.key === key ? { ...f, status: "error", error: msg } : f)),
          );
        });
    }
    if (fileInputRef.current) fileInputRef.current.value = ""; // allow picking the same file again
  };

  const removeFile = (key: string) => {
    const f = files.find((x) => x.key === key);
    setFiles((p) => p.filter((x) => x.key !== key));
    if (f?.attachment) {
      // Best effort: an unsent upload that fails to delete is reaped server-side after 24 hours.
      void fetch(`/api/attachments/${f.attachment.id}`, {
        method: "DELETE",
        headers: CSRF_HEADERS,
      });
    }
  };

  const activeMessageId = useRef<string | null>(null);
  const stop = () => {
    const controller = abortRef.current;
    if (!controller) return;
    const id = activeMessageId.current;
    if (id) {
      // Ask the server to stop; the stream then ends itself with message.stop (status "stopped").
      void fetch(`/api/messages/${id}/stop`, { method: "POST", headers: CSRF_HEADERS });
      // Fallback: if the stream does not end promptly, drop the connection.
      setTimeout(() => controller.abort(), 3000);
    } else {
      controller.abort();
    }
  };

  const regenerate = (assistant: ClientMessage) => {
    if (streaming || !assistant.parentId) return;
    void run({ url: `/api/messages/${assistant.id}/regenerate`, parentId: assistant.parentId });
  };

  const submitEdit = (userMsg: ClientMessage) => {
    const text = editing?.text.trim();
    setEditing(null);
    if (!text || streaming) return;
    void send(text, userMsg.parentId);
  };

  const changeModel = async (next: string) => {
    setModel(next);
    if (convId) {
      try {
        await jsonFetch(`/api/conversations/${convId}`, {
          method: "PATCH",
          body: JSON.stringify({ model: next }),
        });
      } catch {
        setError("Could not save the model choice.");
      }
    }
  };

  const lastAssistantId = [...path].reverse().find((m) => m.role === "assistant")?.id;

  return (
    <div className="flex h-full">
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <h1 className="sr-only">{path.length === 0 ? "New chat" : "Conversation"}</h1>
        <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
          {path.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
              <h2 className="text-3xl font-semibold">What would you like to explore?</h2>
              <p className="text-muted">Ask a question to get started.</p>
            </div>
          ) : (
            <ol
              aria-label="Conversation"
              className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6"
            >
              {path.map((m) => {
                const sibs = siblingsOf(messages, m);
                const idx = sibs.findIndex((s) => s.id === m.id);
                const isUser = m.role === "user";
                return (
                  <li
                    key={m.id}
                    data-role={m.role}
                    data-status={m.status}
                    className={isUser ? "self-end max-w-[85%]" : ""}
                  >
                    <h2 className="mb-1 text-xs font-medium text-muted">
                      {isUser ? "You" : "DeepResearchAI"}
                    </h2>

                    {isUser && m.attachments && m.attachments.length > 0 && (
                      <SentAttachments items={m.attachments} />
                    )}

                    {editing?.id === m.id ? (
                      <div className="flex flex-col gap-2">
                        <label htmlFor="edit-box" className="sr-only">
                          Edit message
                        </label>
                        <textarea
                          id="edit-box"
                          value={editing.text}
                          onChange={(e) => setEditing({ id: m.id, text: e.target.value })}
                          rows={3}
                          className="w-full rounded-ui border border-border bg-surface p-2"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => submitEdit(m)}
                            className="rounded-ui bg-brand px-3 py-1 text-sm text-brand-contrast"
                          >
                            Save and resend
                          </button>
                          <button
                            onClick={() => setEditing(null)}
                            className="rounded-ui border border-border px-3 py-1 text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={`rounded-ui px-3 py-2 ${isUser ? "bg-surface-2" : ""}`}>
                        {isUser ? (
                          <p className="whitespace-pre-wrap break-words">{m.text}</p>
                        ) : m.text ? (
                          <Markdown text={m.text} />
                        ) : m.status === "streaming" ? (
                          <span className="text-muted">Thinking…</span>
                        ) : null}
                        {m.status === "stopped" && (
                          <span className="ml-2 text-xs text-muted">(stopped)</span>
                        )}
                        {m.status === "error" && (
                          <span className="ml-2 text-xs text-danger">(failed)</span>
                        )}
                      </div>
                    )}

                    {!isUser && m.status === "complete" && !m.id.startsWith("a-") && (
                      <ArtifactCards
                        message={m}
                        activeKey={
                          openArtifact ? `${openArtifact.messageId}:${openArtifact.index}` : null
                        }
                        onOpen={setOpenArtifact}
                      />
                    )}

                    <div className="mt-1 flex items-center gap-1 text-muted">
                      {sibs.length > 1 && (
                        <span className="flex items-center gap-1 text-xs">
                          <button
                            aria-label="Previous version"
                            disabled={idx <= 0 || streaming}
                            onClick={() => setLeafId(newestLeafUnder(messages, sibs[idx - 1]!.id))}
                            className="rounded p-1 hover:bg-surface-2 disabled:opacity-40"
                          >
                            <ChevronLeft size={14} aria-hidden />
                          </button>
                          <span aria-label={`Version ${idx + 1} of ${sibs.length}`}>
                            {idx + 1}/{sibs.length}
                          </span>
                          <button
                            aria-label="Next version"
                            disabled={idx >= sibs.length - 1 || streaming}
                            onClick={() => setLeafId(newestLeafUnder(messages, sibs[idx + 1]!.id))}
                            className="rounded p-1 hover:bg-surface-2 disabled:opacity-40"
                          >
                            <ChevronRight size={14} aria-hidden />
                          </button>
                        </span>
                      )}
                      {isUser && !streaming && editing?.id !== m.id && !m.id.startsWith("u-") && (
                        <button
                          aria-label="Edit message"
                          onClick={() => setEditing({ id: m.id, text: m.text })}
                          className="rounded p-1 hover:bg-surface-2"
                        >
                          <Pencil size={14} aria-hidden />
                        </button>
                      )}
                      {!isUser &&
                        m.id === lastAssistantId &&
                        !streaming &&
                        m.parentId &&
                        !m.id.startsWith("a-") && (
                          <button
                            aria-label="Regenerate response"
                            onClick={() => regenerate(m)}
                            className="rounded p-1 hover:bg-surface-2"
                          >
                            <RefreshCw size={14} aria-hidden />
                          </button>
                        )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div className="mx-auto w-full max-w-3xl px-4 pb-4">
          <p role="status" className="sr-only">
            {announce}
          </p>
          {error && (
            <p
              role="alert"
              className="mb-2 rounded-ui border border-danger px-3 py-2 text-sm text-danger"
            >
              {error}
            </p>
          )}
          <form
            className="rounded-2xl border border-border bg-surface p-3 shadow-sm"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <PendingAttachments items={files} onRemove={removeFile} />
            <label htmlFor="composer" className="sr-only">
              Message
            </label>
            <textarea
              id="composer"
              ref={inputRef}
              rows={3}
              value={draft}
              maxLength={100_000}
              placeholder="Ask anything…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                } else if (e.key === "Escape" && streaming) {
                  stop();
                }
              }}
              className="w-full resize-none bg-transparent p-1 outline-none"
            />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  id="file-input"
                  type="file"
                  multiple
                  hidden
                  tabIndex={-1}
                  aria-label="Choose files to attach"
                  accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.md,.markdown,.csv,.json,.log"
                  onChange={(e) => addFiles(e.target.files)}
                />
                <button
                  type="button"
                  aria-label="Attach files"
                  disabled={streaming || files.length >= MAX_FILES_PER_MESSAGE}
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-ui p-2 text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40"
                >
                  <Paperclip size={18} aria-hidden />
                </button>
                <label htmlFor="model" className="sr-only">
                  Model
                </label>
                <select
                  id="model"
                  value={model}
                  disabled={streaming}
                  onChange={(e) => void changeModel(e.target.value)}
                  className="rounded-ui border border-border bg-surface px-2 py-1 text-sm"
                >
                  {models.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <span className="hidden text-xs text-muted sm:inline">
                  Enter to send · Shift+Enter for newline
                </span>
              </div>
              {streaming ? (
                <button
                  type="button"
                  onClick={stop}
                  aria-label="Stop generating"
                  className="rounded-full border border-border p-2 hover:bg-surface-2"
                >
                  <Square size={18} aria-hidden />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!draft.trim() || uploading}
                  aria-label="Send message"
                  className="rounded-full bg-brand p-2 text-brand-contrast disabled:opacity-40"
                >
                  <ArrowUp size={18} aria-hidden />
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
      {openArtifact && (
        <ArtifactPanel artifact={openArtifact} onClose={() => setOpenArtifact(null)} />
      )}
    </div>
  );
}

/** Buttons that open the complete html/svg blocks of a finished message in the side panel. */
function ArtifactCards({
  message,
  activeKey,
  onOpen,
}: {
  message: ClientMessage;
  activeKey: string | null;
  onOpen: (a: OpenArtifact) => void;
}) {
  const artifacts = useMemo(() => extractArtifacts(message.text), [message.text]);
  if (artifacts.length === 0) return null;
  return (
    <ul aria-label="Artifacts" className="mt-2 flex flex-wrap gap-2">
      {artifacts.map((a) => {
        const active = activeKey === `${message.id}:${a.index}`;
        return (
          <li key={a.index}>
            <button
              onClick={() => onOpen({ ...a, messageId: message.id })}
              aria-pressed={active}
              className={`flex items-center gap-2 rounded-ui border px-3 py-2 text-sm hover:bg-surface-2 ${
                active ? "border-brand" : "border-border"
              }`}
            >
              <AppWindow size={16} aria-hidden />
              {/* No aria-label: the accessible name comes from the content, so it can never
                  disagree with the visible text (WCAG 2.5.3 Label in Name). */}
              <span className="sr-only">Open artifact: </span>
              <span className="max-w-[16rem] truncate">{a.title}</span>
              <span className="text-xs uppercase text-muted">{a.language}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

import { notFound } from "next/navigation";
import { z } from "zod";
import { ChatView, type ClientMessage } from "@/components/chat/chat-view";
import { MODELS } from "@/lib/models";
import { auth } from "@/server/auth";
import { loadConversation } from "@/server/chat/service";
import { textOf } from "@/server/repos/chat";

export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  const session = await auth();
  if (!id.success || !session?.user?.id) notFound();

  const conv = await loadConversation(session.user.id, id.data);
  if (!conv) notFound();

  const messages: ClientMessage[] = conv.messages.map((m) => ({
    id: m.id,
    parentId: m.parentId,
    role: m.role === "assistant" ? "assistant" : "user",
    text: textOf(m.content),
    status:
      (["complete", "streaming", "stopped", "error"] as const).find((s) => s === m.status) ??
      "complete",
    createdAt: m.createdAt.toISOString(),
    attachments: m.attachments,
  }));

  return (
    <ChatView
      key={conv.id}
      conversationId={conv.id}
      initialMessages={messages}
      initialModel={conv.model}
      models={MODELS.map((m) => ({ id: m.id, label: m.label }))}
    />
  );
}

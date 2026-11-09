import { ChatView } from "@/components/chat/chat-view";
import { DEFAULT_MODEL, MODELS } from "@/lib/models";

export default function NewChatPage() {
  return (
    <ChatView
      key="new"
      conversationId={null}
      initialMessages={[]}
      initialModel={DEFAULT_MODEL}
      models={MODELS.map((m) => ({ id: m.id, label: m.label }))}
    />
  );
}

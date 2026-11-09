import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { getTheme } from "@/server/theme";
import { listConversations } from "@/server/repos/chat";
import { AppShell } from "@/components/shell/app-shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const theme = await getTheme();
  const conversations = (await listConversations(session.user.id)).map((c) => ({
    id: c.id,
    title: c.title,
  }));
  return (
    <AppShell
      theme={theme}
      conversations={conversations}
      user={{ name: session.user.name ?? null, email: session.user.email ?? null }}
    >
      {children}
    </AppShell>
  );
}

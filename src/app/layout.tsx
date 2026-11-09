import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getTheme } from "@/server/theme";

export const metadata: Metadata = {
  title: "DeepResearchAI",
  description: "AI chat and cited deep research. An independent project.",
  icons: { icon: "/logo.svg" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = await getTheme();
  return (
    <html lang="en" data-theme={theme}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}

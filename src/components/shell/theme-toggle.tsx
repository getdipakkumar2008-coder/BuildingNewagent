"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle({ initialTheme }: { initialTheme: "light" | "dark" }) {
  const [theme, setTheme] = useState<"light" | "dark">(initialTheme);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.cookie = `theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    setTheme(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className="rounded-ui p-2 hover:bg-surface-2"
    >
      {theme === "dark" ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
    </button>
  );
}

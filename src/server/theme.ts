import { cookies } from "next/headers";

export type Theme = "light" | "dark";
export const THEME_COOKIE = "theme";

/** Reads the theme choice server-side so no inline no-flash script (and no CSP exception) is needed. */
export async function getTheme(): Promise<Theme> {
  const value = (await cookies()).get(THEME_COOKIE)?.value;
  return value === "dark" ? "dark" : "light";
}

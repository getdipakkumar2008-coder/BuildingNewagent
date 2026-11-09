import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function devLogin(page: Page) {
  await page.goto("/signin");
  await page.getByRole("button", { name: /dev login/i }).click();
  await page.waitForURL("**/new");
}

test("unauthenticated /new redirects to sign-in", async ({ page }) => {
  await page.goto("/new");
  await expect(page).toHaveURL(/\/signin/);
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
});

test("sign-in lands on /new with a focused composer and empty history", async ({ page }) => {
  await devLogin(page);
  await expect(
    page.getByRole("heading", { name: /what would you like to explore/i }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message" })).toBeFocused();
  await expect(page.getByText("No conversations yet.")).toBeVisible();
});

test("session cookie is HttpOnly, SameSite=Lax, path=/", async ({ page, context }) => {
  await devLogin(page);
  const cookie = (await context.cookies()).find((c) => c.name.endsWith("authjs.session-token"));
  expect(cookie).toBeDefined();
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  expect(cookie?.path).toBe("/");
});

test("responses carry a nonce CSP and security headers", async ({ page }) => {
  const res = await page.goto("/signin");
  const csp = res?.headers()["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(res?.headers()["x-content-type-options"]).toBe("nosniff");
  expect(res?.headers()["x-frame-options"]).toBe("DENY");
});

test("sign out returns to sign-in and /new is protected again", async ({ page }) => {
  await devLogin(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/signin/);
  await page.goto("/new");
  await expect(page).toHaveURL(/\/signin/);
});

test("theme toggle persists across reload", async ({ page }) => {
  await devLogin(page);
  await page.getByRole("button", { name: /switch to dark theme/i }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

for (const theme of ["light", "dark"] as const) {
  test(`axe: no violations on sign-in and /new (${theme})`, async ({ page, context }) => {
    await context.addCookies([{ name: "theme", value: theme, url: "http://localhost:3000" }]);
    await page.goto("/signin");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await devLogin(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}

test("usable at 360px: sidebar opens and closes", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await devLogin(page);
  await page.getByRole("button", { name: "Open sidebar" }).click();
  await expect(page.getByRole("link", { name: "New chat" })).toBeVisible();
  await page.getByRole("button", { name: "Close sidebar", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
});

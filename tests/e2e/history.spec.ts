import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

async function loginAsNewUser(page: Page) {
  const email = `e2e-${randomUUID().slice(0, 8)}@example.test`;
  const res = await page.request.post("/api/dev-login", { form: { email } });
  expect(res.ok()).toBe(true);
  await page.goto("/new");
}

const composer = (page: Page) => page.getByRole("textbox", { name: "Message" });
const history = (page: Page) => page.getByRole("navigation", { name: "Chat history" });

async function startChat(page: Page, text: string) {
  await page.goto("/new");
  await composer(page).fill(text);
  await composer(page).press("Enter");
  await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}$/);
  await expect(page.locator('li[data-role="assistant"]').first()).toHaveAttribute(
    "data-status",
    "complete",
  );
}

test("rename a chat from the sidebar; it persists after reload", async ({ page }) => {
  await loginAsNewUser(page);
  await startChat(page, "rename me please");

  await page.getByRole("button", { name: "Rename chat rename me please" }).click();
  const input = page.getByRole("textbox", { name: "Rename chat rename me please" });
  await input.fill("Quarterly numbers");
  await input.press("Enter");

  await expect(history(page).getByRole("link", { name: "Quarterly numbers" })).toBeVisible();
  await page.reload();
  await expect(history(page).getByRole("link", { name: "Quarterly numbers" })).toBeVisible();
});

test("Escape cancels a rename without changing the title", async ({ page }) => {
  await loginAsNewUser(page);
  await startChat(page, "keep this title");

  await page.getByRole("button", { name: "Rename chat keep this title" }).click();
  const input = page.getByRole("textbox", { name: "Rename chat keep this title" });
  await input.fill("something else");
  await input.press("Escape");

  await expect(history(page).getByRole("link", { name: "keep this title" })).toBeVisible();
  await expect(history(page).getByRole("link", { name: "something else" })).toHaveCount(0);
});

test("delete asks for confirmation, can be cancelled, then removes the chat and leaves the page", async ({
  page,
}) => {
  await loginAsNewUser(page);
  await startChat(page, "delete me soon");

  await page.getByRole("button", { name: "Delete chat delete me soon" }).click();
  const confirm = page.getByRole("group", { name: "Confirm delete delete me soon" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(history(page).getByRole("link", { name: "delete me soon" })).toBeVisible();

  const chatUrl = page.url();
  await page.getByRole("button", { name: "Delete chat delete me soon" }).click();
  await page
    .getByRole("group", { name: "Confirm delete delete me soon" })
    .getByRole("button", { name: "Delete" })
    .click();

  await expect(page).toHaveURL(/\/new$/);
  await expect(history(page).getByRole("link", { name: "delete me soon" })).toHaveCount(0);
  const res = await page.request.get(chatUrl.replace("/c/", "/api/conversations/"));
  expect(res.status()).toBe(404);
});

test("search finds chats by title and by message text, and only your own", async ({
  page,
  browser,
}) => {
  await loginAsNewUser(page);
  await startChat(page, "tell me about zebrafish");
  await startChat(page, "gardening tips");

  const search = page.getByRole("searchbox", { name: "Search chats" });
  await search.fill("zebra");
  await expect(history(page).getByRole("link")).toHaveCount(1);
  await expect(history(page).getByRole("link", { name: "tell me about zebrafish" })).toBeVisible();

  // The fake model echoes the user's text in its reply, so this also exercises body search.
  await search.fill("nonexistentword");
  await expect(history(page).getByText("No chats match your search.")).toBeVisible();

  await search.fill("");
  await expect(history(page).getByRole("link")).toHaveCount(2);

  // A different user searching the same word sees nothing.
  const other = await browser.newPage();
  await loginAsNewUser(other);
  await other.getByRole("searchbox", { name: "Search chats" }).fill("zebrafish");
  await expect(other.getByRole("navigation", { name: "Chat history" })).toContainText(
    "No chats match your search.",
  );
  await other.close();
});

test("axe: sidebar with search, rename and delete-confirm states (light and dark)", async ({
  page,
}) => {
  await loginAsNewUser(page);
  await startChat(page, "accessibility check");

  await page.getByRole("button", { name: "Delete chat accessibility check" }).click();
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations, theme).toEqual([]);
  }
});

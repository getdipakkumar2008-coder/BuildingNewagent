import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

// Fresh user per test so history never leaks between tests (dev-only login accepts @example.test).
async function loginAsNewUser(page: Page) {
  const email = `e2e-${randomUUID().slice(0, 8)}@example.test`;
  const res = await page.request.post("/api/dev-login", { form: { email } });
  expect(res.ok()).toBe(true);
  await page.goto("/new");
}

const composer = (page: Page) => page.getByRole("textbox", { name: "Message" });
const assistantMsgs = (page: Page) => page.locator('li[data-role="assistant"]');

async function ask(page: Page, text: string) {
  await composer(page).fill(text);
  await composer(page).press("Enter");
}

test("send streams a reply, updates the URL and sidebar, and survives reload", async ({ page }) => {
  await loginAsNewUser(page);
  await ask(page, "hello there");

  await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}$/);
  const reply = assistantMsgs(page).first();
  await expect(reply).toContainText("Hello from the fake model. You said: hello there");
  await expect(reply).not.toContainText("private reasoning"); // thinking is never shown
  await expect(reply).toHaveAttribute("data-status", "complete");

  await expect(
    page
      .getByRole("navigation", { name: "Chat history" })
      .getByRole("link", { name: "hello there" }),
  ).toBeVisible();

  await page.reload();
  await expect(assistantMsgs(page).first()).toContainText("You said: hello there");
  await expect(page.locator('li[data-role="user"]')).toContainText("hello there");
});

test("stop saves the partial reply as stopped, and it persists", async ({ page }) => {
  await loginAsNewUser(page);
  await ask(page, "SLOW please");

  const reply = assistantMsgs(page).first();
  await expect(reply).toContainText("word2");
  await page.getByRole("button", { name: "Stop generating" }).click();

  await expect(reply).toHaveAttribute("data-status", "stopped");
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
  const partial = (await reply.innerText()).trim();
  expect(partial).not.toContain("word59");

  await expect
    .poll(async () => {
      await page.reload();
      return assistantMsgs(page).first().getAttribute("data-status");
    })
    .toBe("stopped");
  await expect(assistantMsgs(page).first()).toContainText("word0");
});

test("Escape stops generation", async ({ page }) => {
  await loginAsNewUser(page);
  await ask(page, "SLOW escape");
  await expect(assistantMsgs(page).first()).toContainText("word1");
  await composer(page).press("Escape");
  await expect(assistantMsgs(page).first()).toHaveAttribute("data-status", "stopped");
});

test("regenerate creates a second version with a version switcher", async ({ page }) => {
  await loginAsNewUser(page);
  await ask(page, "question one");
  await expect(assistantMsgs(page).first()).toHaveAttribute("data-status", "complete");

  await page.getByRole("button", { name: "Regenerate response" }).click();
  await expect(page.getByLabel("Version 2 of 2")).toBeVisible();
  await expect(assistantMsgs(page)).toHaveCount(1);

  await page.getByRole("button", { name: "Previous version" }).click();
  await expect(page.getByLabel("Version 1 of 2")).toBeVisible();
});

test("editing a message creates a new branch and keeps the old one reachable", async ({ page }) => {
  await loginAsNewUser(page);
  await ask(page, "original text");
  await expect(assistantMsgs(page).first()).toHaveAttribute("data-status", "complete");

  await page.getByRole("button", { name: "Edit message" }).click();
  await page.getByRole("textbox", { name: "Edit message" }).fill("edited text");
  await page.getByRole("button", { name: "Save and resend" }).click();

  await expect(assistantMsgs(page).first()).toContainText("You said: edited text");
  await expect(page.getByLabel("Version 2 of 2").first()).toBeVisible();

  await page.getByRole("button", { name: "Previous version" }).first().click();
  await expect(page.locator('li[data-role="user"]')).toContainText("original text");
  await expect(assistantMsgs(page).first()).toContainText("You said: original text");
});

test("model choice is sent to the API and persisted per conversation", async ({ page }) => {
  await loginAsNewUser(page);
  await page.getByLabel("Model", { exact: true }).selectOption("claude-haiku-5-5");
  await ask(page, "which model");
  await expect(assistantMsgs(page).first()).toHaveAttribute("data-status", "complete");
  await page.reload();
  await expect(page.getByLabel("Model", { exact: true })).toHaveValue("claude-haiku-5-5");

  const saved = page.waitForResponse((r) => r.request().method() === "PATCH" && r.ok());
  await page.getByLabel("Model", { exact: true }).selectOption("claude-opus-5-5");
  await saved;
  await page.reload();
  await expect(page.getByLabel("Model", { exact: true })).toHaveValue("claude-opus-5-5");
});

test("upstream overload shows a friendly error and no raw upstream text", async ({ page }) => {
  await loginAsNewUser(page);
  await ask(page, "FAIL_OVERLOADED now");
  const alert = page.locator('p[role="alert"]');
  await expect(alert).toContainText(/overloaded/i);
  await expect(alert).not.toContainText('Overloaded"');
  await expect(assistantMsgs(page).first()).toHaveAttribute("data-status", "error");
});

test("upstream rate limit is shown as a rate-limit message", async ({ page }) => {
  await loginAsNewUser(page);
  await ask(page, "HTTP429");
  const alert = page.locator('p[role="alert"]');
  await expect(alert).toContainText(/rate limited/i);
  await expect(alert).not.toContainText("slow down");
});

test("another user cannot open my conversation (404)", async ({ browser, page }) => {
  await loginAsNewUser(page);
  await ask(page, "private thing");
  await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}$/);
  const url = page.url();

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.request.post("http://localhost:3000/api/dev-login", {
    form: { email: `intruder-${randomUUID().slice(0, 6)}@example.test` },
  });
  const res = await otherPage.goto(url);
  expect(res?.status()).toBe(404);
  await expect(otherPage.getByText("private thing")).toHaveCount(0);
  await other.close();
});

test("API rejects cross-origin and header-less writes (CSRF)", async ({ page }) => {
  await loginAsNewUser(page);
  const noHeader = await page.request.post("/api/conversations", { data: {} });
  expect(noHeader.status()).toBe(403);
  const crossOrigin = await page.request.post("/api/conversations", {
    data: {},
    headers: { Origin: "https://evil.example", "X-Requested-With": "deepresearchai" },
  });
  expect(crossOrigin.status()).toBe(403);
  const ok = await page.request.post("/api/conversations", {
    data: {},
    headers: { "X-Requested-With": "deepresearchai" },
  });
  expect(ok.status()).toBe(201);
});

test("unauthenticated API calls get 401 problem+json", async ({ request }) => {
  const res = await request.get("/api/conversations");
  expect(res.status()).toBe(401);
  expect(res.headers()["content-type"]).toContain("application/problem+json");
});

test("SSE response is same-origin only: no CORS headers, no buffering", async ({ page }) => {
  await loginAsNewUser(page);
  const conv = await (
    await page.request.post("/api/conversations", {
      data: {},
      headers: { "X-Requested-With": "deepresearchai" },
    })
  ).json();
  const res = await page.request.post(`/api/conversations/${conv.id}/messages`, {
    data: { content: "headers check", parent_id: null },
    headers: { "X-Requested-With": "deepresearchai" },
  });
  expect(res.headers()["content-type"]).toContain("text/event-stream");
  expect(res.headers()["access-control-allow-origin"]).toBeUndefined();
  expect(res.headers()["x-accel-buffering"]).toBe("no");
  expect(await res.text()).toContain("event: message.stop");
});

test("axe: a conversation page has no violations (light and dark)", async ({ page, context }) => {
  await loginAsNewUser(page);
  await ask(page, "accessibility check");
  await expect(assistantMsgs(page).first()).toHaveAttribute("data-status", "complete");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await context.addCookies([{ name: "theme", value: "dark", url: "http://localhost:3000" }]);
  await page.reload();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

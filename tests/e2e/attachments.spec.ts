import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const UPLOAD_DIR = path.resolve("test-results", "e2e-uploads");
const CSRF = { "X-Requested-With": "deepresearchai" };

// A real 1x1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

function countFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    n += statSync(full).isDirectory() ? countFiles(full) : 1;
  }
  return n;
}

async function loginAsNewUser(page: Page) {
  const email = `e2e-${randomUUID().slice(0, 8)}@example.test`;
  const res = await page.request.post("/api/dev-login", { form: { email } });
  expect(res.ok()).toBe(true);
  await page.goto("/new");
}

const composer = (page: Page) => page.getByRole("textbox", { name: "Message" });
const chips = (page: Page) => page.getByRole("list", { name: "Files to attach" });
const fileInput = (page: Page) => page.locator("#file-input");

async function attach(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<string> {
  const uploaded = page.waitForResponse(
    (r) => r.url().endsWith("/api/attachments") && r.request().method() === "POST",
  );
  await fileInput(page).setInputFiles(file);
  const res = await uploaded;
  return res.ok() ? ((await res.json()) as { id: string }).id : "";
}

test("attach a text file: it reaches the model as wrapped data, shows on the message, and downloads", async ({
  page,
}) => {
  await loginAsNewUser(page);
  const id = await attach(page, {
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("marker-quartz-7781 is the secret word"),
  });
  await expect(chips(page).getByText("notes.txt")).toBeVisible();
  await expect(chips(page).locator('[data-status="ready"]')).toHaveCount(1);

  await composer(page).fill("what does the file say?");
  await composer(page).press("Enter");

  // The fake model echoes the text blocks it received, which include the wrapped file.
  const reply = page.locator('li[data-role="assistant"]').first();
  await expect(reply).toContainText("marker-quartz-7781");
  await expect(reply).toContainText("untrusted-user-data");
  await expect(reply).toHaveAttribute("data-status", "complete");

  const sent = page
    .getByRole("list", { name: "Attachments" })
    .getByRole("link", { name: /notes\.txt/ });
  await expect(sent).toBeVisible();
  await expect(chips(page)).toHaveCount(0); // composer chips were cleared on send

  // Survives reload, and the owner can download it as an attachment that is never sniffed or inlined.
  await page.reload();
  await expect(sent).toBeVisible();
  const dl = await page.request.get(`/api/attachments/${id}`);
  expect(dl.status()).toBe(200);
  expect(dl.headers()["content-disposition"]).toMatch(/^attachment; filename="notes\.txt"/);
  expect(dl.headers()["x-content-type-options"]).toBe("nosniff");
  expect(dl.headers()["content-security-policy"]).toContain("sandbox");
  expect(await dl.text()).toBe("marker-quartz-7781 is the secret word");
});

test("images and PDFs go to the model as native blocks", async ({ page }) => {
  await loginAsNewUser(page);
  await attach(page, { name: "pixel.png", mimeType: "image/png", buffer: PNG });
  await attach(page, { name: "paper.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(chips(page).locator('[data-status="ready"]')).toHaveCount(2);

  await composer(page).fill("describe these");
  await composer(page).press("Enter");
  await expect(page.locator('li[data-role="assistant"]').first()).toContainText(
    "[blocks: image,document]",
  );
});

test("unsupported and mismatched files are rejected with a clear message and never sent", async ({
  page,
}) => {
  await loginAsNewUser(page);
  // HTML, a PNG disguised as .txt, and binary junk named .txt.
  await fileInput(page).setInputFiles({
    name: "page.html",
    mimeType: "text/html",
    buffer: Buffer.from("<script>alert(1)</script>"),
  });
  await expect(chips(page).getByText("That file type isn't supported")).toBeVisible();

  await fileInput(page).setInputFiles({ name: "photo.txt", mimeType: "text/plain", buffer: PNG });
  await expect(chips(page).getByText("contents don't match its name")).toBeVisible();

  await fileInput(page).setInputFiles({
    name: "bin.txt",
    mimeType: "text/plain",
    buffer: Buffer.from([0x68, 0x69, 0x00, 0x01, 0x02]),
  });
  await expect(chips(page).getByText("isn't valid UTF-8 text")).toBeVisible();

  // A failed chip can be removed, and sending text still works with no attachments.
  for (const name of ["page.html", "photo.txt", "bin.txt"]) {
    await page.getByRole("button", { name: `Remove ${name}` }).click();
  }
  await expect(chips(page)).toHaveCount(0);
  await composer(page).fill("just text");
  await composer(page).press("Enter");
  await expect(page.locator('li[data-role="assistant"]').first()).toContainText(
    "You said: just text",
  );
  await expect(page.getByRole("list", { name: "Attachments" })).toHaveCount(0);
});

test("removing a chip deletes the unsent upload from the server", async ({ page }) => {
  await loginAsNewUser(page);
  const id = await attach(page, {
    name: "gone.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("x"),
  });
  expect((await page.request.get(`/api/attachments/${id}`)).status()).toBe(200);

  await page.getByRole("button", { name: "Remove gone.txt" }).click();
  await expect
    .poll(async () => (await page.request.get(`/api/attachments/${id}`)).status())
    .toBe(404);
});

test("another user and anonymous visitors cannot read, delete or reuse my attachment", async ({
  page,
  browser,
}) => {
  await loginAsNewUser(page);
  const id = await attach(page, {
    name: "mine.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("private"),
  });

  const other = await browser.newPage();
  await loginAsNewUser(other);
  expect((await other.request.get(`/api/attachments/${id}`)).status()).toBe(404);
  expect((await other.request.delete(`/api/attachments/${id}`, { headers: CSRF })).status()).toBe(
    404,
  );

  // Trying to send my attachment id in their conversation fails and creates nothing.
  const conv = await other.request.post("/api/conversations", { headers: CSRF, data: {} });
  const convId = ((await conv.json()) as { id: string }).id;
  const res = await other.request.post(`/api/conversations/${convId}/messages`, {
    headers: CSRF,
    data: { content: "steal", attachment_ids: [id] },
  });
  expect(res.status()).toBe(422);
  expect(((await res.json()) as { code: string }).code).toBe("attachment_unavailable");
  await other.close();

  const anon = await browser.newContext();
  expect((await anon.request.get(`/api/attachments/${id}`)).status()).toBe(401);
  await anon.close();
  expect((await page.request.get(`/api/attachments/${id}`)).status()).toBe(200); // still mine
});

test("upload API: CSRF header required, oversize and empty rejected", async ({ page }) => {
  await loginAsNewUser(page);
  const noHeader = await page.request.post("/api/attachments", {
    multipart: { file: { name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("a") } },
  });
  expect(noHeader.status()).toBe(403);

  const empty = await page.request.post("/api/attachments", {
    headers: CSRF,
    multipart: { file: { name: "a.txt", mimeType: "text/plain", buffer: Buffer.alloc(0) } },
  });
  expect(empty.status()).toBe(422);

  const big = await page.request.post("/api/attachments", {
    headers: CSRF,
    multipart: {
      file: {
        name: "big.txt",
        mimeType: "text/plain",
        buffer: Buffer.alloc(1024 * 1024 + 1, 0x61),
      },
    },
  });
  expect(big.status()).toBe(413);

  // A 15 MB PDF must arrive intact: Next's proxy would truncate bodies over 10 MB, so uploads bypass it.
  const bigPdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(15 * 1024 * 1024, 0x20)]);
  const large = await page.request.post("/api/attachments", {
    headers: CSRF,
    multipart: { file: { name: "large.pdf", mimeType: "application/pdf", buffer: bigPdf } },
  });
  expect(large.status()).toBe(201);
  const largeBody = (await large.json()) as { id: string; size_bytes: number };
  expect(largeBody.size_bytes).toBe(bigPdf.length);
  const back = await page.request.get(`/api/attachments/${largeBody.id}`);
  expect((await back.body()).length).toBe(bigPdf.length);

  const missing = await page.request.post("/api/attachments", {
    headers: CSRF,
    multipart: { other: "x" },
  });
  expect(missing.status()).toBe(422);
});

test("deleting a conversation also deletes its stored files", async ({ page }) => {
  await loginAsNewUser(page);
  const before = countFiles(UPLOAD_DIR);
  const id = await attach(page, {
    name: "temp.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("bye"),
  });
  expect(countFiles(UPLOAD_DIR)).toBe(before + 1);

  await composer(page).fill("please keep this file for a moment");
  await composer(page).press("Enter");
  await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}$/);
  await expect(page.locator('li[data-role="assistant"]').first()).toHaveAttribute(
    "data-status",
    "complete",
  );

  await page.getByRole("button", { name: /Delete chat please keep this file/ }).click();
  await page
    .getByRole("group", { name: /Confirm delete/ })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page).toHaveURL(/\/new$/);

  await expect.poll(() => countFiles(UPLOAD_DIR)).toBe(before);
  expect((await page.request.get(`/api/attachments/${id}`)).status()).toBe(404);
});

test("axe: composer with ready, uploading-error chips and a message with attachments (light and dark)", async ({
  page,
}) => {
  await loginAsNewUser(page);
  await attach(page, { name: "ok.txt", mimeType: "text/plain", buffer: Buffer.from("fine") });
  await fileInput(page).setInputFiles({
    name: "bad.html",
    mimeType: "text/html",
    buffer: Buffer.from("<b>x</b>"),
  });
  await expect(chips(page).getByText("That file type isn't supported")).toBeVisible();

  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(r.violations, `composer ${theme}`).toEqual([]);
  }

  await page.getByRole("button", { name: "Remove bad.html" }).click();
  await composer(page).fill("check");
  await composer(page).press("Enter");
  await expect(page.getByRole("list", { name: "Attachments" })).toBeVisible();
  await expect(page.locator('li[data-role="assistant"]').first()).toHaveAttribute(
    "data-status",
    "complete",
  );
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(r.violations, `message ${theme}`).toEqual([]);
  }
});

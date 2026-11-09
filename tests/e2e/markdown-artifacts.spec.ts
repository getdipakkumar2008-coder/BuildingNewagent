import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

async function loginAsNewUser(page: Page) {
  const email = `m3-${randomUUID().slice(0, 8)}@example.test`;
  const res = await page.request.post("/api/dev-login", { form: { email } });
  expect(res.ok()).toBe(true);
  await page.goto("/new");
}

const composer = (page: Page) => page.getByRole("textbox", { name: "Message" });
const reply = (page: Page) => page.locator('li[data-role="assistant"]').first();

async function ask(page: Page, text: string) {
  await composer(page).fill(text);
  await composer(page).press("Enter");
  // Wait for the LATEST reply (the first one may already be complete in a multi-turn test).
  await expect(page.locator('li[data-role="assistant"]').last()).toHaveAttribute(
    "data-status",
    "complete",
    { timeout: 15_000 },
  );
}

test.describe("markdown rendering", () => {
  test("renders headings, emphasis, lists, quote, table and links", async ({ page }) => {
    await loginAsNewUser(page);
    await ask(page, "MARKDOWN please");
    const r = reply(page);

    await expect(r.getByRole("heading", { name: "Title heading", level: 3 })).toBeVisible();
    await expect(r.locator("strong")).toHaveText("bold");
    await expect(r.locator("em")).toHaveText("italic");
    await expect(r.locator("p code")).toHaveText("inline code");
    await expect(r.locator("ul li")).toHaveCount(2);
    await expect(r.locator("ol li")).toHaveCount(2);
    await expect(r.locator("blockquote")).toContainText("a quoted line");
    await expect(r.locator("table tbody tr")).toHaveCount(2);
    await expect(r.locator("th")).toHaveText(["Name", "Value"]);

    const link = r.getByRole("link", { name: "safe link" });
    await expect(link).toHaveAttribute("href", "https://example.com/docs");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
    // No raw markdown syntax leaks through.
    await expect(r).not.toContainText("**bold**");
    await expect(r).not.toContainText("```");
  });

  test("code blocks are labelled, syntax highlighted and copyable", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await loginAsNewUser(page);
    await ask(page, "MARKDOWN code");
    const r = reply(page);

    await expect(r.locator("pre")).toHaveCount(2);
    await expect(r.locator(".hljs-keyword").first()).toBeVisible();
    await expect(r.getByText("python", { exact: true })).toBeVisible();

    await r.getByRole("button", { name: "Copy code" }).first().click();
    await expect(r.getByRole("button", { name: "Copied" })).toBeVisible();
    // The OS clipboard may convert LF to CRLF (Windows); compare content, not line-ending style.
    const raw = await page.evaluate(() => navigator.clipboard.readText());
    const clip = raw.replaceAll(String.fromCharCode(13), ""); // drop CRs added by the OS clipboard
    expect(clip).toBe(
      "const answer: number = 42;\nfunction greet(name: string) {\n  return `hello ${name}`;\n}",
    );
    // Copied text is source, not highlighted markup.
    expect(clip).not.toContain("<span");
  });

  test("renders correctly after a reload (persisted text, same output)", async ({ page }) => {
    await loginAsNewUser(page);
    await ask(page, "MARKDOWN reload");
    await page.reload();
    await expect(reply(page).locator("table tbody tr")).toHaveCount(2);
    await expect(reply(page).locator(".hljs-keyword").first()).toBeVisible();
  });
});

test.describe("hostile model output (XSS)", () => {
  test("script, handlers, javascript: links, images and iframes are inert", async ({ page }) => {
    const requested: string[] = [];
    const dialogs: string[] = [];
    page.on("request", (req) => requested.push(req.url()));
    page.on("dialog", async (d) => {
      dialogs.push(d.message());
      await d.dismiss();
    });

    await loginAsNewUser(page);
    await ask(page, "XSS please");
    const r = reply(page);
    await expect(r).toContainText("Safe ending.");

    // 1. Nothing executed.
    expect(
      await page.evaluate(() => (window as unknown as { __pwned?: string }).__pwned),
    ).toBeUndefined();
    expect(dialogs).toEqual([]);

    // 2. Dangerous elements never made it into the DOM.
    for (const sel of ["script", "iframe", "img", "svg[onload]", "[onerror]", "[onload]"]) {
      await expect(r.locator(sel), sel).toHaveCount(0);
    }
    // The javascript: link kept its text but is not a link.
    await expect(r.getByText("click me")).toBeVisible();
    await expect(r.getByRole("link", { name: "click me" })).toHaveCount(0);
    await expect(r.locator('a[href^="javascript"]')).toHaveCount(0);

    // 3. The browser never fetched the tracking pixel or the framed page.
    expect(requested.filter((u) => /tracking-pixel|\/framed/.test(u))).toEqual([]);
  });

  test("still inert when reloaded from storage", async ({ page }) => {
    await loginAsNewUser(page);
    await ask(page, "XSS again");
    await page.reload();
    await expect(reply(page)).toContainText("Safe ending.");
    expect(
      await page.evaluate(() => (window as unknown as { __pwned?: string }).__pwned),
    ).toBeUndefined();
    await expect(reply(page).locator("script, iframe, img")).toHaveCount(0);
  });
});

test.describe("artifacts", () => {
  test("html artifact opens in a sandboxed preview that cannot reach the app", async ({ page }) => {
    await loginAsNewUser(page);
    await ask(page, "ARTIFACT please");

    await reply(page).getByRole("button", { name: "Open artifact: Probe Page" }).click();
    const panel = page.getByRole("complementary", { name: "Artifact preview" });
    await expect(panel).toBeVisible();

    const frameEl = panel.locator("iframe");
    await expect(frameEl).toHaveAttribute("sandbox", "allow-scripts"); // never allow-same-origin
    await expect(frameEl).toHaveAttribute("src", /^\/api\/artifacts\/[0-9a-f-]{36}\/0$/);

    const frame = page.frameLocator('iframe[title^="Preview of"]');
    await expect(frame.locator("body[data-done='1']")).toBeAttached({ timeout: 10_000 });
    await expect(frame.getByRole("heading", { name: "Hello artifact" })).toBeVisible();

    const probe = await frame.locator("#out").innerText();
    expect(probe).toContain("origin=null"); // opaque origin
    expect(probe).toMatch(/cookie=blocked:SecurityError/);
    expect(probe).toMatch(/localStorage=blocked:SecurityError/);
    expect(probe).toMatch(/parentDoc=blocked:SecurityError/);
    expect(probe).toMatch(/topNav=blocked/);
    expect(probe).toContain("fetch=blocked"); // CSP connect-src 'none'
    expect(probe).not.toContain("LEAK");
    expect(probe).not.toContain("allowed");

    // The app page was not navigated away by the artifact.
    expect(page.url()).toMatch(/\/c\/[0-9a-f-]{36}$/);
  });

  test("artifact response headers: sandbox CSP, framing limited to our origin, nosniff", async ({
    page,
  }) => {
    await loginAsNewUser(page);
    await ask(page, "ARTIFACT headers");
    const msgId = await page.evaluate(async () => {
      const id = location.pathname.split("/").pop();
      const conv = await (await fetch(`/api/conversations/${id}`)).json();
      return conv.messages.find((m: { role: string }) => m.role === "assistant").id as string;
    });

    const res = await page.request.get(`/api/artifacts/${msgId}/0`);
    expect(res.status()).toBe(200);
    const h = res.headers();
    expect(h["content-type"]).toContain("text/html");
    expect(h["content-security-policy"]).toMatch(/^sandbox allow-scripts;/);
    expect(h["content-security-policy"]).toContain("connect-src 'none'");
    expect(h["content-security-policy"]).not.toContain("allow-same-origin");
    expect(h["x-frame-options"]).toBe("SAMEORIGIN");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["cache-control"]).toContain("no-store");

    // Out of range ordinal / non-uuid / unknown message → 404 without detail.
    expect((await page.request.get(`/api/artifacts/${msgId}/5`)).status()).toBe(404);
    expect((await page.request.get(`/api/artifacts/not-a-uuid/0`)).status()).toBe(404);
    expect((await page.request.get(`/api/artifacts/${randomUUID()}/0`)).status()).toBe(404);

    // Other pages are still un-frameable.
    const home = await page.request.get("/signin");
    expect(home.headers()["x-frame-options"]).toBe("DENY");
    expect(home.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  });

  test("opening the artifact URL directly is still sandboxed (opaque origin)", async ({ page }) => {
    await loginAsNewUser(page);
    await ask(page, "ARTIFACT direct");
    const url = await page.evaluate(async () => {
      const id = location.pathname.split("/").pop();
      const conv = await (await fetch(`/api/conversations/${id}`)).json();
      const m = conv.messages.find((x: { role: string }) => x.role === "assistant");
      return `/api/artifacts/${m.id}/0`;
    });
    await page.goto(url);
    await expect(page.locator("body[data-done='1']")).toBeAttached({ timeout: 10_000 });
    expect(await page.evaluate(() => window.origin)).toBe("null");
    expect(await page.locator("#out").innerText()).toContain("cookie=blocked");
  });

  test("another user and anonymous visitors cannot load my artifact", async ({ browser, page }) => {
    await loginAsNewUser(page);
    await ask(page, "ARTIFACT private");
    const msgId = await page.evaluate(async () => {
      const id = location.pathname.split("/").pop();
      const conv = await (await fetch(`/api/conversations/${id}`)).json();
      return conv.messages.find((m: { role: string }) => m.role === "assistant").id as string;
    });

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.request.post("http://localhost:3000/api/dev-login", {
      form: { email: `intruder-${randomUUID().slice(0, 6)}@example.test` },
    });
    expect(
      (await otherPage.request.get(`http://localhost:3000/api/artifacts/${msgId}/0`)).status(),
    ).toBe(404);
    await other.close();

    const anon = await browser.newContext();
    const res = await anon.request.get(`http://localhost:3000/api/artifacts/${msgId}/0`);
    expect(res.status()).toBe(401);
    await anon.close();
  });

  test("code tab shows the source; Escape closes the panel", async ({ page }) => {
    await loginAsNewUser(page);
    await ask(page, "ARTIFACT tabs");
    await reply(page).getByRole("button", { name: "Open artifact: Probe Page" }).click();
    const panel = page.getByRole("complementary", { name: "Artifact preview" });

    await panel.getByRole("tab", { name: "code" }).click();
    await expect(panel.getByLabel("Artifact source")).toContainText(
      '<h1 id="hello">Hello artifact</h1>',
    );
    await expect(panel.locator("iframe")).toHaveCount(0);

    await panel.getByRole("tab", { name: "preview" }).click();
    await expect(panel.locator("iframe")).toHaveCount(1);

    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
  });

  test("svg artifact previews", async ({ page }) => {
    await loginAsNewUser(page);
    await ask(page, "SVGART please");
    await reply(page).getByRole("button", { name: "Open artifact: Red Dot" }).click();
    const frame = page.frameLocator('iframe[title^="Preview of"]');
    await expect(frame.locator("svg circle")).toBeAttached({ timeout: 10_000 });
  });

  test("on a phone-sized screen the panel is a full-screen overlay that can be closed", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await loginAsNewUser(page);
    await ask(page, "ARTIFACT mobile");
    await reply(page).getByRole("button", { name: "Open artifact: Probe Page" }).click();
    const panel = page.getByRole("complementary", { name: "Artifact preview" });
    const box = await panel.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(355);
    await panel.getByRole("button", { name: "Close artifact panel" }).click();
    await expect(panel).toHaveCount(0);
  });
});

test.describe("keyboard shortcuts", () => {
  test("? opens the list, Esc closes it; / focuses the composer; Ctrl+Shift+O starts a new chat", async ({
    page,
  }) => {
    await loginAsNewUser(page);
    await ask(page, "shortcut test");
    await expect(page).toHaveURL(/\/c\//);

    await page.locator("main").click({ position: { x: 5, y: 5 } }); // move focus out of the text box
    await page.keyboard.press("?");
    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Start a new chat");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await page.locator("main").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("/");
    await expect(composer(page)).toBeFocused();

    // Typing "?" or "/" inside the text box must NOT trigger shortcuts.
    await composer(page).pressSequentially("what? a/b");
    await expect(composer(page)).toHaveValue("what? a/b");
    await expect(dialog).toBeHidden();

    await page.keyboard.press("Control+Shift+O");
    await expect(page).toHaveURL(/\/new$/);
  });

  test("the shortcuts button works for mouse and keyboard users", async ({ page }) => {
    await loginAsNewUser(page);
    await page.getByRole("button", { name: "Keyboard shortcuts" }).click();
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});

test.describe("accessibility with rich content", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`axe: markdown + code + table + open artifact panel (${theme})`, async ({
      page,
      context,
    }) => {
      await context.addCookies([{ name: "theme", value: theme, url: "http://localhost:3000" }]);
      await loginAsNewUser(page);
      await ask(page, "MARKDOWN a11y");
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

      await ask(page, "ARTIFACT a11y");
      await page
        .getByRole("button", { name: /Open artifact/ })
        .last()
        .click();
      await expect(page.getByRole("complementary", { name: "Artifact preview" })).toBeVisible();
      const results = await new AxeBuilder({ page })
        .exclude('iframe[title^="Preview of"]')
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }
});

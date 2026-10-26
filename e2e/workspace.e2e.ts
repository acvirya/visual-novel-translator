import { test, expect, type Page } from "@playwright/test";

async function assertFits(page: Page) {
  await expect(page.getByText("Loading workspace…")).toBeHidden();
  const layout = await page.evaluate(() => {
    const main = document.querySelector("main")!;
    return { body: document.body.scrollWidth, viewport: innerWidth, main: main.scrollWidth, client: main.clientWidth };
  });
  expect(layout.body).toBeLessThanOrEqual(layout.viewport);
  expect(layout.main).toBeLessThanOrEqual(layout.client + 1);
  await expect(page.getByText("Something went wrong", { exact: true })).toBeHidden();
}

for (const viewport of [{ width: 620, height: 480 }, { width: 900, height: 650 }, { width: 1440, height: 900 }]) {
  test(`workspace navigation fits ${viewport.width} × ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await page.getByRole("tab", { name: "Capture setup", exact: true }).click();
    await assertFits(page);
    await page.getByRole("button", { name: /Read from the screen/ }).click();
    await assertFits(page);
    await page.getByRole("tab", { name: "In-game overlay", exact: true }).click();
    await expect(page.locator("iframe")).toBeVisible();
    await expect(page.frameLocator("iframe").locator("body")).toContainText("Tomoyo");
    await assertFits(page);
    for (const name of ["Script translator", "Knowledge base", "Activity & usage", "Settings"]) {
      await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name, exact: true }).click();
      await assertFits(page);
    }
    for (const name of ["Providers & prompts", "Text replacements", "General & shortcuts"]) {
      await page.getByRole("tab", { name, exact: true }).click();
      await assertFits(page);
    }
    expect(errors).toEqual([]);
  });
}

test("custom overlay CSS and markup cannot affect the host or send requests", async ({ page }) => {
  const blockedRequests: string[] = [];
  const completedRequests: string[] = [];
  page.on("requestfailed", (request) => {
    if (request.url().includes("overlay-test.invalid")) blockedRequests.push(request.failure()?.errorText ?? "");
  });
  page.on("requestfinished", (request) => {
    if (request.url().includes("overlay-test.invalid")) completedRequests.push(request.url());
  });
  await page.addInitScript(() => {
    localStorage.setItem("vn_translator_universal_settings_v2", JSON.stringify({
      overlay: { config: {
        useCustomTemplate: true,
        customTemplateHtml: '<div>Safe text</div><img src="https://overlay-test.invalid/image"><script>parent.document.body.textContent="attacked"</script>',
        customTemplateCss: 'body { background: red; } .sidebar { display:none!important; } @import "https://overlay-test.invalid/style.css"; div { background-image:url(https://overlay-test.invalid/pixel); }',
      } },
    }));
  });
  await page.goto("/");
  await page.getByRole("tab", { name: "In-game overlay", exact: true }).click();
  await expect(page.frameLocator("iframe").locator("body")).toContainText("Safe text");
  await expect(page.locator("iframe")).toHaveAttribute("sandbox", "allow-same-origin");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe("rgb(255, 0, 0)");
  // Chromium reports a request event even when CSP prevents network dispatch.
  // Verify the rejection reason, rather than counting those request events.
  await expect.poll(() => blockedRequests.length).toBeGreaterThan(0);
  expect(blockedRequests.every((reason) => /csp|blocked_by_csp/i.test(reason))).toBe(true);
  expect(completedRequests).toEqual([]);
});

test("provider key stays out of localStorage and dialogs restore keyboard focus", async ({ page }) => {
  await page.setViewportSize({ width: 620, height: 480 });
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("API key", { exact: true }).fill("test-deepl-key-for-ui-only");
  await page.getByRole("button", { name: "Save key", exact: true }).click();
  await expect(page.getByText("DeepL API key saved securely.", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("vn_translator_universal_settings_v2"))).not.toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("vn_translator_universal_settings_v2"))).not.toContain("test-deepl-key-for-ui-only");
  const providersTab = page.getByRole("tab", { name: "Providers & prompts", exact: true });
  await providersTab.focus();
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "General & shortcuts", exact: true })).toBeFocused();
  const resetButton = page.getByRole("button", { name: "Factory Reset (All Settings)", exact: true });
  await resetButton.click();
  await expect(page.getByRole("dialog", { name: "Confirm Factory Reset", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(resetButton).toBeFocused();
});

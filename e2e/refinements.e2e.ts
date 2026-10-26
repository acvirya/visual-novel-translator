import { test, expect } from "@playwright/test";

test("glossary dialogs, category filters and locked terms", async ({ page }) => {
  await page.setViewportSize({ width: 620, height: 620 });
  await page.addInitScript(() => { if (!localStorage.getItem("vn_translator_universal_settings_v2")) localStorage.setItem("vn_translator_universal_settings_v2", JSON.stringify({ glossary: { terms: [] } })); });
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Knowledge base", exact: true }).click();
  await expect(page.getByLabel("Original term", { exact: true })).toBeHidden();
  for (const [original, translation, category] of [["Sakura", "Cherry", "Name"], ["School", "Academy", "Place"]]) {
    await page.getByRole("button", { name: "Add term", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add term", exact: true });
    await dialog.getByLabel("Original term", { exact: true }).fill(original);
    await dialog.getByLabel("Translation", { exact: true }).fill(translation);
    await dialog.getByLabel("Category", { exact: true }).selectOption(category);
    await dialog.getByRole("button", { name: "Add term", exact: true }).click();
    await expect(dialog).toBeHidden();
  }
  await page.getByRole("button", { name: "Categories", exact: true }).click();
  await page.getByRole("button", { name: /Name Character names/ }).click();
  await expect(page.locator(".glossary-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".glossary-table")).toContainText("Sakura");
  await page.getByRole("button", { name: "Close categories", exact: true }).click();
  await expect(page.locator(".glossary-table tbody tr")).toHaveCount(2);
  await page.getByRole("button", { name: "Lock Sakura", exact: true }).click();
  await expect(page.getByRole("button", { name: "Delete Sakura", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Clear all", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Clear unlocked terms?", exact: true });
  await expect(confirmation).toContainText("Locked terms will be kept");
  await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".glossary-table tbody tr")).toHaveCount(2);
  await page.getByRole("button", { name: "Clear all", exact: true }).click();
  await confirmation.getByRole("button", { name: "Clear unlocked terms", exact: true }).click();
  await expect(page.locator(".glossary-table tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Edit Sakura", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit term", exact: true });
  await edit.getByLabel("Translation", { exact: true }).fill("Cherry blossom");
  await edit.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("dialog", { name: "Save term changes?", exact: true }).getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".glossary-table")).toContainText("Cherry blossom");
  await page.evaluate(async () => { const { settingsManager } = await import("/src/services/settingsManager.ts"); await settingsManager.flushPendingSaves(); });
  await page.reload();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Knowledge base", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unlock Sakura", exact: true })).toBeVisible();
});

test("script memory only imports into an open script and confirms destructive edits", async ({ page }) => {
  await page.setViewportSize({ width: 620, height: 620 });
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Knowledge base", exact: true }).click();
  await page.getByRole("tab", { name: "Script memory", exact: true }).click();
  await expect(page.getByRole("button", { name: /Import (from Scripts|entries)/ })).toHaveCount(0);
  await page.evaluate(async () => {
    const { scriptManagerService } = await import("/src/services/scriptManagerService.ts");
    scriptManagerService.openScriptContent(null, "chapter.jsonl", '{"id":1,"message":"Original dialogue","translated_message":"Translated dialogue"}');
  });
  await expect(page.getByRole("button", { name: "Import entries", exact: true })).toBeVisible();
  await expect(page.getByText("Autosave active", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Clear All", exact: true }).click();
  await page.getByRole("dialog", { name: "Clear all script entries?", exact: true }).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("Original dialogue", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear All", exact: true }).click();
  await page.getByRole("dialog", { name: "Clear all script entries?", exact: true }).getByRole("button", { name: "Delete all entries", exact: true }).click();
  await expect(page.getByText("Original dialogue", { exact: true })).toHaveCount(0);
});

test("new descending logs follow the newest row and receive shortcut window results", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: /Live translation/, exact: false }).click();
  await page.evaluate(async () => {
    const { useTranslationStore } = await import("/src/stores/useTranslationStore.ts");
    useTranslationStore.getState().setLiveLogs(Array.from({ length: 30 }, (_, index) => ({ id: `old-${index}`, timestamp: "12:00", provider: "Google Translate (Free)", durationMs: 10, message: { source: `Old source ${index}`, translated: `Old result ${index}` } })));
  });
  await page.locator("main").evaluate((main) => { main.scrollTop = main.scrollHeight; });
  const auxiliary = await page.context().newPage();
  await auxiliary.goto("/?regionSelector=true&mode=snipping");
  await auxiliary.evaluate(async () => {
    const { translationManager } = await import("/src/services/translationManager.ts");
    translationManager.notify({ id: "shortcut-result", timestamp: "12:01", provider: "Google Translate (Free)", sourceType: "ocr", durationMs: 20, message: { source: "New shortcut source", translated: "New shortcut translation" } });
  });
  await expect(page.getByText("New shortcut translation", { exact: true })).toBeVisible();
  await expect.poll(() => page.locator("main").evaluate((main) => main.scrollTop)).toBe(0);
  await auxiliary.close();
});

test("overlay updates keep the frame and backdrop, animating only text", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("vn_translator_universal_settings_v2", JSON.stringify({ overlay: { config: { textAnimation: "typewriter", animationSpeedMs: 5, useCustomTemplate: true, customTemplateHtml: '<div class="test-backdrop">{{translatedMessage}}</div>', customTemplateCss: '.test-backdrop { background: #123456; padding: 12px; }' } } })));
  await page.goto("/?overlay=true");
  const frame = page.frameLocator("iframe");
  await expect(frame.locator(".test-backdrop")).toBeVisible();
  await page.locator("iframe").evaluate((element: HTMLIFrameElement) => {
    const state = window as unknown as Record<string, unknown>;
    state.auditFrame = element;
    state.auditDocument = element.contentDocument;
    state.auditBackdrop = element.contentDocument!.querySelector(".test-backdrop");
    state.auditLoads = 0;
    element.addEventListener("load", () => { state.auditLoads = Number(state.auditLoads) + 1; });
  });
  const sendDialogue = async (id: number, text: string) => page.evaluate(({ id, text }) => {
    const channel = new BroadcastChannel("vn_translator_overlay_channel");
    channel.postMessage({ type: "DIALOGUE_UPDATE", dialogue: { id, message: "Source", translatedMessage: text } }); channel.close();
  }, { id, text });
  await sendDialogue(1, "The first translated dialogue.");
  await expect(frame.locator(".test-backdrop")).toHaveText("The first translated dialogue.");
  await page.evaluate(async () => {
    const { settingsManager } = await import("/src/services/settingsManager.ts");
    const channel = new BroadcastChannel("vn_translator_overlay_channel");
    channel.postMessage({ type: "CONFIG_UPDATE", config: { ...settingsManager.getOverlay().config, textAnimation: "fade", animationSpeedMs: 2000 } }); channel.close();
  });
  await sendDialogue(2, "Another translated line.");
  await expect(frame.locator(".test-backdrop")).toHaveText("Another translated line.");
  expect(await page.locator("iframe").evaluate((element: HTMLIFrameElement) => {
    const state = window as unknown as Record<string, unknown>;
    const backdrop = element.contentDocument!.querySelector(".test-backdrop")!;
    const animations = element.contentDocument!.getAnimations();
    return { sameFrame: state.auditFrame === element, sameDocument: state.auditDocument === element.contentDocument, sameBackdrop: state.auditBackdrop === backdrop, loads: state.auditLoads, backdropOpacity: getComputedStyle(backdrop).opacity, textOnly: animations.every((animation) => ((animation.effect as KeyframeEffect).target as Element).hasAttribute("data-vn-text")), animated: animations.length > 0 };
  })).toEqual({ sameFrame: true, sameDocument: true, sameBackdrop: true, loads: 0, backdropOpacity: "1", textOnly: true, animated: true });
});

test("resetting a provider endpoint and deleting a key require confirmation", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const { settingsManager } = await import("/src/services/settingsManager.ts");
    await settingsManager.saveLlmProvider({ id: "openrouter", apiKey: "test-local-only-key", baseUrl: "https://example.invalid/v1", isVerified: false });
  });
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Reset Default", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Reset provider endpoint?", exact: true });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Provider API base URL", { exact: true })).toHaveValue("https://example.invalid/v1");
  await page.getByRole("button", { name: "Reset Default", exact: true }).click();
  await dialog.getByRole("button", { name: "Reset endpoint", exact: true }).click();
  await expect(page.getByLabel("Provider API base URL", { exact: true })).toHaveValue("");
  await page.getByLabel("Provider API key", { exact: true }).fill("");
  await page.getByLabel("Provider API key", { exact: true }).press("Tab");
  dialog = page.getByRole("dialog", { name: "Remove saved API key?", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await page.evaluate(async () => (await import("/src/services/settingsManager.ts")).settingsManager.getOpenRouterApiKey())).toBe("test-local-only-key");
});

import { test, expect, type Page } from "@playwright/test";

async function openOpenAiSettings(page: Page) {
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "OpenAI", exact: true }).click();
}

test("OpenAI offers exactly one active authentication method and persists the choice", async ({ page }) => {
  await page.setViewportSize({ width: 620, height: 620 });
  await page.goto("/");
  await openOpenAiSettings(page);
  const apiKey = page.getByRole("radio", { name: /API key OpenAI API billing/ });
  const oauth = page.getByRole("radio", { name: /OAuth.*ChatGPT/ });
  await expect(apiKey).toBeChecked();
  await expect(page.getByLabel("Provider API key", { exact: true })).toBeVisible();
  await oauth.check();
  await expect(oauth).toBeChecked();
  await expect(apiKey).not.toBeChecked();
  await expect(page.getByLabel("Provider API key", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Provider API base URL", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue with ChatGPT", exact: true })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Manage usage", exact: true })).toHaveAttribute("href", "https://chatgpt.com/settings/usage");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("vn_translator_universal_settings_v2") || "{}").llmProviders?.openai?.authMethod)).toBe("oauth");
  await page.reload();
  await openOpenAiSettings(page);
  await expect(oauth).toBeChecked();
  await apiKey.check();
  await expect(apiKey).toBeChecked();
  await expect(oauth).not.toBeChecked();
  await expect(page.getByLabel("Provider API key", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test("OAuth login, model refresh, cancellation and sign-out use account summaries", async ({ page }) => {
  await page.goto("/");
  // Simulate the native IPC contract without opening a browser, using real accounts or spending quota.
  await page.evaluate(async () => {
    const { TauriBridge } = await import("/src/services/tauriBridge.ts");
    const { SecureStorageService } = await import("/src/services/secureStorageService.ts");
    const state = { authMethod: "api_key", selectedAccountId: null as string | null, accounts: [] as Array<{ id: string; email: string; connected: boolean }>, pending: false, error: null };
    (window as unknown as Record<string, unknown>).oauthTestState = state;
    SecureStorageService.isTauriEnvironment = () => true;
    TauriBridge.openAiAuthStatus = async () => structuredClone(state) as Awaited<ReturnType<typeof TauriBridge.openAiAuthStatus>>;
    TauriBridge.openAiSetAuthMethod = async method => { state.authMethod = method; state.pending = false; };
    TauriBridge.openAiOAuthStart = async () => { state.pending = true; };
    TauriBridge.openAiOAuthCancel = async () => { state.pending = false; };
    TauriBridge.openAiOAuthModels = async () => [{ id: "account-model", name: "Account model" }];
    TauriBridge.openAiOAuthDisconnect = async () => { state.accounts[0].connected = false; state.selectedAccountId = null; return true; };
    TauriBridge.setSecureKey = async () => {};
    TauriBridge.deleteSecureKey = async () => {};
    TauriBridge.saveAppSettings = async () => {};
  });
  await openOpenAiSettings(page);
  await page.getByRole("radio", { name: /OAuth.*ChatGPT/ }).check();
  await page.getByRole("button", { name: "Continue with ChatGPT", exact: true }).click();
  await expect(page.getByText(/Waiting for browser sign-in/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel sign-in", exact: true }).click();
  await expect(page.getByText(/Waiting for browser sign-in/)).toHaveCount(0);
  await page.getByRole("button", { name: "Continue with ChatGPT", exact: true }).click();
  await page.evaluate(() => {
    const state = (window as unknown as Record<string, any>).oauthTestState;
    state.pending = false; state.selectedAccountId = "account-1";
    state.accounts = [{ id: "account-1", email: "test@example.com", connected: true }];
  });
  await expect(page.getByText("Using ChatGPT plan", { exact: true })).toBeVisible();
  await expect(page.getByLabel("ChatGPT account", { exact: true })).toContainText("test@example.com");
  await expect.poll(() => page.evaluate(async () => (await import("/src/services/settingsManager.ts")).settingsManager.getLlmProvider("openai").customModels?.[0]?.id)).toBe("account-model");
  await page.getByRole("radio", { name: /API key OpenAI API billing/ }).click();
  const switchDialog = page.getByRole("dialog", { name: "Switch OpenAI authentication?", exact: true });
  await switchDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("radio", { name: /OAuth.*ChatGPT/ })).toBeChecked();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  const signOut = page.getByRole("dialog", { name: "Sign out of ChatGPT?", exact: true });
  await signOut.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("Using ChatGPT plan", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await signOut.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByText("Connect your ChatGPT account", { exact: true })).toBeVisible();
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem("vn_translator_universal_settings_v2")!));
  expect(persisted.llmProviders.openai.oauthConnected).toBeUndefined();
  expect(persisted.llmProviders.openai.oauthAccountId).toBeUndefined();
});

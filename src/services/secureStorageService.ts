import { TauriBridge } from "./tauriBridge";
import { logger } from "./loggerService";

/**
 * In-memory fallback for non-Tauri environments (e.g. Vitest, Vite preview).
 */
const inMemoryKeyring = new Map<string, string>();

/**
 * Service responsible for accessing OS-level Secure Storage
 * (Windows Credential Manager via Rust/Tauri Keyring crate).
 */
export const SecureStorageService = {
  /**
   * Check if running inside Tauri runtime
   */
  isTauriEnvironment(): boolean {
    return (
      typeof window !== "undefined" &&
      !!(window as any).__TAURI_INTERNALS__
    );
  },

  /**
   * Retrieve an API key securely from OS Keyring
   */
  async getApiKey(providerId: string): Promise<string | null> {
    if (!this.isTauriEnvironment()) {
      return inMemoryKeyring.get(providerId) ?? null;
    }
    try {
      const key = await TauriBridge.getSecureKey(providerId);
      return key ?? null;
    } catch (err) {
      logger.warn("SecureStorage", `Failed to get key for ${providerId}: ${err}`);
      throw new Error("Unable to read credentials from the operating system secure storage.");
    }
  },

  /**
   * Store an API key securely in OS Keyring
   */
  async setApiKey(providerId: string, apiKey: string): Promise<void> {
    const trimmed = (apiKey || "").trim();
    if (!this.isTauriEnvironment()) {
      if (trimmed) {
        inMemoryKeyring.set(providerId, trimmed);
      } else {
        inMemoryKeyring.delete(providerId);
      }
      return;
    }

    try {
      if (trimmed) {
        await TauriBridge.setSecureKey(providerId, trimmed);
      } else {
        await TauriBridge.deleteSecureKey(providerId);
      }
      if (trimmed) inMemoryKeyring.set(providerId, trimmed);
      else inMemoryKeyring.delete(providerId);
    } catch (err) {
      logger.error("SecureStorage", `Failed to set key for ${providerId}: ${err}`);
      throw new Error("The API key could not be saved securely. Please retry.");
    }
  },

  /**
   * Delete an API key from OS Keyring
   */
  async deleteApiKey(providerId: string): Promise<void> {
    if (!this.isTauriEnvironment()) {
      inMemoryKeyring.delete(providerId);
      return;
    }
    try {
      await TauriBridge.deleteSecureKey(providerId);
      inMemoryKeyring.delete(providerId);
    } catch (err) {
      logger.warn("SecureStorage", `Failed to delete key for ${providerId}: ${err}`);
      throw new Error("The API key could not be deleted from secure storage.");
    }
  },

  /**
   * Clear in-memory fallback store (useful for test resets)
   */
  clearInMemoryKeyring(): void {
    inMemoryKeyring.clear();
  },
};

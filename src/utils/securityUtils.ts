/**
 * Security utilities for protecting sensitive credentials (e.g. API keys) stored locally.
 */

const PREFIX = "enc:v1:";
const SALT_KEY = "VN_TRANSLATOR_SECURE_STORAGE_SALT_2026";

/**
 * Encrypt a sensitive string (e.g. API key) with salted cipher.
 * Returns empty string if input is empty or null.
 * If already encrypted, returns as is.
 */
export function encryptSensitive(plaintext: string | undefined | null): string {
  if (!plaintext || typeof plaintext !== "string") return "";
  const trimmed = plaintext.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith(PREFIX)) return trimmed;

  try {
    const keyBytes = new TextEncoder().encode(SALT_KEY);
    const dataBytes = new TextEncoder().encode(trimmed);
    const encrypted = new Uint8Array(dataBytes.length);

    for (let i = 0; i < dataBytes.length; i++) {
      encrypted[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length] ^ ((i * 37 + 13) & 0xff);
    }

    let binary = "";
    for (let i = 0; i < encrypted.length; i++) {
      binary += String.fromCharCode(encrypted[i]);
    }
    const b64 =
      typeof btoa === "function"
        ? btoa(binary)
        : (globalThis as any).Buffer?.from(encrypted).toString("base64") || "";
    return `${PREFIX}${b64}`;
  } catch (err) {
    console.warn("Failed to encrypt sensitive data:", err);
    return trimmed;
  }
}

/**
 * Decrypt a sensitive string.
 * If the string does not have the encrypted prefix, it is treated as legacy plain text
 * and returned as is for transparent backward compatibility.
 */
export function decryptSensitive(ciphertext: string | undefined | null): string {
  if (!ciphertext || typeof ciphertext !== "string") return "";
  const trimmed = ciphertext.trim();
  if (!trimmed) return "";
  if (!trimmed.startsWith(PREFIX)) {
    // Legacy plain-text credential
    return trimmed;
  }

  const rawB64 = trimmed.slice(PREFIX.length);
  try {
    let binary = "";
    if (typeof atob === "function") {
      binary = atob(rawB64);
    } else if (typeof (globalThis as any).Buffer !== "undefined") {
      binary = (globalThis as any).Buffer.from(rawB64, "base64").toString("binary");
    } else {
      return trimmed;
    }

    const keyBytes = new TextEncoder().encode(SALT_KEY);
    const encrypted = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      encrypted[i] = binary.charCodeAt(i);
    }

    const decrypted = new Uint8Array(encrypted.length);
    for (let i = 0; i < encrypted.length; i++) {
      decrypted[i] = encrypted[i] ^ keyBytes[i % keyBytes.length] ^ ((i * 37 + 13) & 0xff);
    }

    return new TextDecoder().decode(decrypted);
  } catch (err) {
    console.warn("Failed to decrypt sensitive data, returning original:", err);
    return trimmed;
  }
}

import { describe, it, expect } from "vitest";
import { encryptSensitive, decryptSensitive } from "../securityUtils";

describe("securityUtils", () => {
  it("should encrypt and decrypt a sensitive string accurately", () => {
    const original = "sk-or-v1-abcdef1234567890XYZ!@#$%";
    const encrypted = encryptSensitive(original);

    expect(encrypted).not.toBe(original);
    expect(encrypted.startsWith("enc:v1:")).toBe(true);

    const decrypted = decryptSensitive(encrypted);
    expect(decrypted).toBe(original);
  });

  it("should handle empty or null values gracefully", () => {
    expect(encryptSensitive("")).toBe("");
    expect(encryptSensitive(undefined)).toBe("");
    expect(decryptSensitive("")).toBe("");
    expect(decryptSensitive(undefined)).toBe("");
  });

  it("should support legacy plain text backward compatibility", () => {
    const legacyKey = "sk-plain-legacy-key-999";
    const decrypted = decryptSensitive(legacyKey);
    expect(decrypted).toBe(legacyKey);
  });

  it("should not double-encrypt an already encrypted string", () => {
    const original = "my-secret-token";
    const encrypted1 = encryptSensitive(original);
    const encrypted2 = encryptSensitive(encrypted1);
    expect(encrypted2).toBe(encrypted1);

    expect(decryptSensitive(encrypted2)).toBe(original);
  });
});

import { beforeAll, describe, expect, it } from "vitest";
import {
  decrypt,
  encrypt,
  ensureEncrypted,
  isEncrypted,
  maskSensitiveValue,
  safeDecrypt,
} from "../encryption";

describe("encryption", () => {
  beforeAll(() => {
    // Set a valid encryption key for testing
    process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  describe("encrypt/decrypt", () => {
    it("should encrypt and decrypt a string", () => {
      const plaintext = "my-secret-api-key-12345";
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(encrypted).not.toBe(plaintext);
      expect(decrypted).toBe(plaintext);
    });

    it("should produce different ciphertext for same plaintext (due to random IV)", () => {
      const plaintext = "same-text";
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2);
      expect(decrypt(encrypted1)).toBe(plaintext);
      expect(decrypt(encrypted2)).toBe(plaintext);
    });

    it("should handle empty string", () => {
      const plaintext = "";
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should handle unicode characters", () => {
      const plaintext = "日本語テスト 🔐 émojis";
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should handle long strings", () => {
      const plaintext = "x".repeat(10000);
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe("isEncrypted", () => {
    it("should return true for encrypted values", () => {
      const encrypted = encrypt("test");
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it("should return false for plain text", () => {
      expect(isEncrypted("not-encrypted")).toBe(false);
      expect(isEncrypted("sk-abc123")).toBe(false);
    });

    it("should return false for empty/null values", () => {
      expect(isEncrypted("")).toBe(false);
      // @ts-expect-error - testing runtime behavior
      expect(isEncrypted(null)).toBe(false);
      // @ts-expect-error - testing runtime behavior
      expect(isEncrypted(undefined)).toBe(false);
    });

    it("should return false for invalid format", () => {
      expect(isEncrypted("invalid:format")).toBe(false);
      expect(isEncrypted("a:b:c")).toBe(false);
    });
  });

  describe("safeDecrypt", () => {
    it("should decrypt encrypted values", () => {
      const plaintext = "secret";
      const encrypted = encrypt(plaintext);
      expect(safeDecrypt(encrypted)).toBe(plaintext);
    });

    it("should return plain text as-is if not encrypted", () => {
      const plaintext = "not-encrypted-api-key";
      expect(safeDecrypt(plaintext)).toBe(plaintext);
    });

    it("should return null for null/undefined", () => {
      expect(safeDecrypt(null)).toBeNull();
      expect(safeDecrypt(undefined)).toBeNull();
    });
  });

  describe("ensureEncrypted", () => {
    it("should encrypt plain text", () => {
      const plaintext = "plain-api-key";
      const result = ensureEncrypted(plaintext);

      expect(isEncrypted(result)).toBe(true);
      expect(decrypt(result)).toBe(plaintext);
    });

    it("should not double-encrypt already encrypted values", () => {
      const plaintext = "original";
      const encrypted = encrypt(plaintext);
      const result = ensureEncrypted(encrypted);

      expect(result).toBe(encrypted);
      expect(decrypt(result)).toBe(plaintext);
    });
  });

  describe("maskSensitiveValue", () => {
    it("should mask most of the value, showing last 4 characters", () => {
      const masked = maskSensitiveValue("sk-abc123456789");
      expect(masked.endsWith("6789")).toBe(true);
      expect(masked.startsWith("•")).toBe(true);
    });

    it("should return all dots for short values", () => {
      expect(maskSensitiveValue("short")).toBe("••••••••");
      expect(maskSensitiveValue("ab")).toBe("••••••••");
    });

    it("should handle empty string", () => {
      expect(maskSensitiveValue("")).toBe("••••••••");
    });
  });
});

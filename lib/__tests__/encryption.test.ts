import { createCipheriv, createDecipheriv } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  decrypt,
  encrypt,
  ensureEncrypted,
  isEncrypted,
  maskSensitiveValue,
  safeDecrypt,
} from "../encryption";

describe("encryption", async () => {
  beforeAll(() => {
    // Set a valid encryption key for testing
    process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  it("preserves ciphertext written by the old Node AES-GCM implementation", async () => {
    const key = Buffer.from(process.env.ENCRYPTION_KEY!, "hex");
    const iv = Buffer.from("00112233445566778899aabbccddeeff", "hex");
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const data = Buffer.concat([cipher.update("legacy-key-秘密", "utf8"), cipher.final()]);
    const legacy = `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${data.toString("hex")}`;
    expect(await decrypt(legacy)).toBe("legacy-key-秘密");
    const [newIv, tag, content] = (await encrypt("new-key"))
      .split(":")
      .map((part) => Buffer.from(part, "hex"));
    const decipher = createDecipheriv("aes-256-gcm", key, newIv);
    decipher.setAuthTag(tag);
    expect(Buffer.concat([decipher.update(content), decipher.final()]).toString("utf8")).toBe(
      "new-key",
    );
  });

  describe("encrypt/decrypt", async () => {
    it("should encrypt and decrypt a string", async () => {
      const plaintext = "my-secret-api-key-12345";
      const encrypted = await encrypt(plaintext);
      const decrypted = await decrypt(encrypted);

      expect(encrypted).not.toBe(plaintext);
      expect(decrypted).toBe(plaintext);
    });

    it("should produce different ciphertext for same plaintext (due to random IV)", async () => {
      const plaintext = "same-text";
      const encrypted1 = await encrypt(plaintext);
      const encrypted2 = await encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2);
      expect(await decrypt(encrypted1)).toBe(plaintext);
      expect(await decrypt(encrypted2)).toBe(plaintext);
    });

    it("should handle empty string", async () => {
      const plaintext = "";
      const encrypted = await encrypt(plaintext);
      const decrypted = await decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should handle unicode characters", async () => {
      const plaintext = "日本語テスト 🔐 émojis";
      const encrypted = await encrypt(plaintext);
      const decrypted = await decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should handle long strings", async () => {
      const plaintext = "x".repeat(10000);
      const encrypted = await encrypt(plaintext);
      const decrypted = await decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe("isEncrypted", async () => {
    it("should return true for encrypted values", async () => {
      const encrypted = await encrypt("test");
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it("should return false for plain text", async () => {
      expect(isEncrypted("not-encrypted")).toBe(false);
      expect(isEncrypted("sk-abc123")).toBe(false);
    });

    it("should return false for empty/null values", async () => {
      expect(isEncrypted("")).toBe(false);
      // @ts-expect-error - testing runtime behavior
      expect(isEncrypted(null)).toBe(false);
      // @ts-expect-error - testing runtime behavior
      expect(isEncrypted(undefined)).toBe(false);
    });

    it("should return false for invalid format", async () => {
      expect(isEncrypted("invalid:format")).toBe(false);
      expect(isEncrypted("a:b:c")).toBe(false);
    });
  });

  describe("safeDecrypt", async () => {
    it("should decrypt encrypted values", async () => {
      const plaintext = "secret";
      const encrypted = await encrypt(plaintext);
      expect(await safeDecrypt(encrypted)).toBe(plaintext);
    });

    it("should return plain text as-is if not encrypted", async () => {
      const plaintext = "not-encrypted-api-key";
      expect(await safeDecrypt(plaintext)).toBe(plaintext);
    });

    it("should return null for null/undefined", async () => {
      expect(await safeDecrypt(null)).toBeNull();
      expect(await safeDecrypt(undefined)).toBeNull();
    });
  });

  describe("ensureEncrypted", async () => {
    it("should encrypt plain text", async () => {
      const plaintext = "plain-api-key";
      const result = await ensureEncrypted(plaintext);

      expect(isEncrypted(result)).toBe(true);
      expect(await decrypt(result)).toBe(plaintext);
    });

    it("should not double-encrypt already encrypted values", async () => {
      const plaintext = "original";
      const encrypted = await encrypt(plaintext);
      const result = await ensureEncrypted(encrypted);

      expect(result).toBe(encrypted);
      expect(await decrypt(result)).toBe(plaintext);
    });
  });

  describe("maskSensitiveValue", async () => {
    it("should mask most of the value, showing last 4 characters", async () => {
      const masked = maskSensitiveValue("sk-abc123456789");
      expect(masked.endsWith("6789")).toBe(true);
      expect(masked.startsWith("•")).toBe(true);
    });

    it("should return all dots for short values", async () => {
      expect(maskSensitiveValue("short")).toBe("••••••••");
      expect(maskSensitiveValue("ab")).toBe("••••••••");
    });

    it("should handle empty string", async () => {
      expect(maskSensitiveValue("")).toBe("••••••••");
    });
  });
});

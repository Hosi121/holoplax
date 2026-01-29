import crypto from "crypto";
import { logger } from "./logger";

/**
 * AES-256-GCM encryption utilities for sensitive data
 *
 * Environment variable required:
 * ENCRYPTION_KEY - 64 character hex string (32 bytes)
 *
 * Generate with: openssl rand -hex 32
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Get the encryption key from environment
 * @throws Error if key is not configured or invalid
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is not set. Generate with: openssl rand -hex 32",
    );
  }

  if (key.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
  }

  return Buffer.from(key, "hex");
}

/**
 * Encrypt a string using AES-256-GCM
 * @param plaintext - The string to encrypt
 * @returns Encrypted string in format: iv:authTag:ciphertext (all hex encoded)
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt a string encrypted with encrypt()
 * @param encryptedData - The encrypted string in format: iv:authTag:ciphertext
 * @returns Decrypted plaintext string
 * @throws Error if decryption fails (invalid data or wrong key)
 */
export function decrypt(encryptedData: string): string {
  const key = getEncryptionKey();

  const parts = encryptedData.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted data format");
  }

  const [ivHex, authTagHex, ciphertext] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  if (iv.length !== IV_LENGTH) {
    throw new Error("Invalid IV length");
  }

  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Invalid auth tag length");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Check if a string is encrypted (has the expected format)
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false;
  const parts = value.split(":");
  if (parts.length !== 3) return false;

  const [ivHex, authTagHex] = parts;
  // Check if IV and auth tag are valid hex and correct length
  return (
    /^[0-9a-f]+$/i.test(ivHex) &&
    /^[0-9a-f]+$/i.test(authTagHex) &&
    ivHex.length === IV_LENGTH * 2 &&
    authTagHex.length === AUTH_TAG_LENGTH * 2
  );
}

/**
 * Safely decrypt a value, returning null if decryption fails or value is not encrypted
 */
export function safeDecrypt(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!isEncrypted(value)) return value; // Return as-is if not encrypted

  try {
    return decrypt(value);
  } catch (error) {
    logger.error("Failed to decrypt value", {}, error);
    return null;
  }
}

/**
 * Encrypt a value only if it's not already encrypted
 */
export function ensureEncrypted(value: string): string {
  if (isEncrypted(value)) return value;
  return encrypt(value);
}

/**
 * Mask a sensitive value for display (show last 4 characters)
 */
export function maskSensitiveValue(value: string): string {
  if (!value || value.length <= 8) {
    return "••••••••";
  }
  return `${"•".repeat(value.length - 4)}${value.slice(-4)}`;
}

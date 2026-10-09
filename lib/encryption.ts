import { runtimeEnv } from "../server/runtime";
import { logger } from "./logger";

const hex = (value: Uint8Array) =>
  Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
const bytes = (value: string) =>
  Uint8Array.from(value.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
async function encryptionKey() {
  const key = runtimeEnv.ENCRYPTION_KEY;
  if (!key || !/^[a-f\d]{64}$/i.test(key))
    throw new Error("ENCRYPTION_KEY must be 64 hexadecimal characters");
  return crypto.subtle.importKey("raw", bytes(key), "AES-GCM", false, ["encrypt", "decrypt"]);
}
// Preserve the existing iv:tag:ciphertext encoding so imported provider keys remain readable.
export async function encrypt(plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const output = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      await encryptionKey(),
      new TextEncoder().encode(plaintext),
    ),
  );
  return `${hex(iv)}:${hex(output.slice(-16))}:${hex(output.slice(0, -16))}`;
}
export async function decrypt(value: string): Promise<string> {
  if (!isEncrypted(value)) throw new Error("Invalid encrypted data format");
  const [iv, tag, ciphertext] = value.split(":");
  const cipher = bytes(ciphertext),
    auth = bytes(tag);
  const combined = new Uint8Array(cipher.length + auth.length);
  combined.set(cipher);
  combined.set(auth, cipher.length);
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes(iv), tagLength: 128 },
      await encryptionKey(),
      combined,
    ),
  );
}
export function isEncrypted(value: string): boolean {
  return typeof value === "string" && /^[a-f\d]{32}:[a-f\d]{32}:(?:[a-f\d]{2})*$/i.test(value);
}
export async function safeDecrypt(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  if (!isEncrypted(value)) return value;
  try {
    return await decrypt(value);
  } catch (error) {
    logger.error("Failed to decrypt value", {}, error);
    return null;
  }
}
export async function ensureEncrypted(value: string): Promise<string> {
  return isEncrypted(value) ? value : encrypt(value);
}
export function maskSensitiveValue(value: string): string {
  return !value || value.length <= 8
    ? "••••••••"
    : `${"•".repeat(value.length - 4)}${value.slice(-4)}`;
}

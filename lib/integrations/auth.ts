import crypto from "crypto";
import { AppError, errorResponse } from "../http/errors";

const integrationUnauthorized = (message: string) =>
  errorResponse(new AppError("INTEGRATION_UNAUTHORIZED", message, 401));

export const extractHeaderToken = (request: Request) =>
  request.headers.get("x-integration-token") ??
  request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
  null;

export const firstEnvToken = (keys: string[]) => {
  for (const key of keys) {
    const val = process.env[key];
    if (val?.trim()) return val.trim();
  }
  return "";
};

export const validateSharedToken = (request: Request, envKeys: string[]) => {
  const expected = firstEnvToken(envKeys);
  if (!expected) return integrationUnauthorized("integration token not configured");
  const received = extractHeaderToken(request);
  if (!received) return integrationUnauthorized("invalid integration token");

  // Constant-time comparison to prevent timing attacks. Hash both sides to a
  // fixed-length digest first: this makes the comparison length-independent so
  // it leaks neither the content nor the length of the expected token.
  const expectedHash = crypto.createHash("sha256").update(expected, "utf8").digest();
  const receivedHash = crypto.createHash("sha256").update(received, "utf8").digest();
  if (!crypto.timingSafeEqual(expectedHash, receivedHash)) {
    return integrationUnauthorized("invalid integration token");
  }
  return null;
};

/**
 * Defense-in-depth HMAC verification for first-party integration webhooks
 * (e.g. our Discord bot). When a signing secret is configured the request must
 * carry `x-integration-timestamp` and `x-integration-signature` headers, where
 * the signature is `v0=HMAC_SHA256(secret, "v0:{timestamp}:{rawBody}")`. A 5
 * minute timestamp window provides replay protection. When no secret is
 * configured this is a no-op so the shared-token check still governs access.
 *
 * Reads the body from a clone so the caller can still parse the original.
 */
export const verifyIntegrationSignature = async (request: Request, secretEnvKeys: string[]) => {
  const secret = firstEnvToken(secretEnvKeys);
  if (!secret) return null; // not configured → rely on shared-token auth only

  const timestamp = request.headers.get("x-integration-timestamp") ?? "";
  const signature = request.headers.get("x-integration-signature") ?? "";
  if (!timestamp || !signature) {
    return integrationUnauthorized("missing integration signature");
  }

  const ts = Number(timestamp);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 60 * 5) {
    return integrationUnauthorized("integration request expired");
  }

  const raw = await request.clone().text();
  const base = `v0:${timestamp}:${raw}`;
  const expected = `v0=${crypto.createHmac("sha256", secret).update(base).digest("hex")}`;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
      return integrationUnauthorized("invalid integration signature");
    }
  } catch {
    return integrationUnauthorized("invalid integration signature");
  }
  return null;
};

export const verifySlackSignature = (
  signingSecret: string,
  body: string,
  timestamp: string,
  signature: string,
) => {
  const base = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac("sha256", signingSecret);
  hmac.update(base);
  const expected = `v0=${hmac.digest("hex")}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
};

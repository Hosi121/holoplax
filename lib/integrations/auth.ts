import crypto from "crypto";
import { unauthorizedWithMessage } from "../api-response";

export const extractHeaderToken = (request: Request) =>
  request.headers.get("x-integration-token") ??
  request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
  null;

export const firstEnvToken = (keys: string[]) => {
  for (const key of keys) {
    const val = process.env[key];
    if (val && val.trim()) return val.trim();
  }
  return "";
};

export const validateSharedToken = (request: Request, envKeys: string[]) => {
  const expected = firstEnvToken(envKeys);
  if (!expected) return unauthorizedWithMessage("integration token not configured");
  const received = extractHeaderToken(request);
  if (!received || received !== expected) return unauthorizedWithMessage("invalid integration token");
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

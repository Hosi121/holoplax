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

  // Constant-time comparison to prevent timing attacks.
  // Pad received to the expected length so timingSafeEqual never throws on
  // mismatched lengths; also verify lengths match separately so that neither
  // operation leaks information through timing side-channels.
  const expectedBuf = Buffer.from(expected, "utf8");
  const receivedPadded = received.slice(0, expected.length).padEnd(expected.length, "\0");
  const receivedBuf = Buffer.from(receivedPadded, "utf8");
  const contentMatch = crypto.timingSafeEqual(expectedBuf, receivedBuf);
  const lengthMatch = received.length === expected.length;
  if (!contentMatch || !lengthMatch) return integrationUnauthorized("invalid integration token");
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

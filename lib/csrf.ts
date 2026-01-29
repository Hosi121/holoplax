import { randomBytes } from "crypto";

const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";
const CSRF_TOKEN_LENGTH = 32;

/**
 * Generate a new CSRF token
 */
export function generateCsrfToken(): string {
  return randomBytes(CSRF_TOKEN_LENGTH).toString("hex");
}

/**
 * Get CSRF token from request cookie
 */
export function getCsrfTokenFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";").map((c) => c.trim());
  for (const cookie of cookies) {
    const [name, value] = cookie.split("=");
    if (name === CSRF_COOKIE_NAME) {
      return value;
    }
  }
  return null;
}

/**
 * Get CSRF token from request header
 */
export function getCsrfTokenFromHeader(headers: Headers): string | null {
  return headers.get(CSRF_HEADER_NAME);
}

/**
 * Validate CSRF token
 * Returns true if token from header matches token from cookie
 */
export function validateCsrfToken(
  cookieHeader: string | null,
  headers: Headers,
): { valid: boolean; reason?: string } {
  const cookieToken = getCsrfTokenFromCookie(cookieHeader);
  const headerToken = getCsrfTokenFromHeader(headers);

  if (!cookieToken) {
    return { valid: false, reason: "CSRF cookie not found" };
  }

  if (!headerToken) {
    return { valid: false, reason: "CSRF header not found" };
  }

  // Constant-time comparison to prevent timing attacks
  if (cookieToken.length !== headerToken.length) {
    return { valid: false, reason: "CSRF token mismatch" };
  }

  let result = 0;
  for (let i = 0; i < cookieToken.length; i++) {
    result |= cookieToken.charCodeAt(i) ^ headerToken.charCodeAt(i);
  }

  if (result !== 0) {
    return { valid: false, reason: "CSRF token mismatch" };
  }

  return { valid: true };
}

/**
 * Create Set-Cookie header for CSRF token
 */
export function createCsrfCookieHeader(token: string, secure: boolean): string {
  const parts = [`${CSRF_COOKIE_NAME}=${token}`, "Path=/", "SameSite=Strict", "HttpOnly"];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export const CSRF_COOKIE_NAME_EXPORT = CSRF_COOKIE_NAME;
export const CSRF_HEADER_NAME_EXPORT = CSRF_HEADER_NAME;

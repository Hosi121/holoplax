import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  createCsrfCookieHeader,
  generateCsrfToken,
  getCsrfTokenFromCookie,
  validateCsrfToken,
} from "./lib/csrf";
import { getRateLimitConfig, getRateLimitHeaders, rateLimiter } from "./lib/rate-limiter";

const REQUEST_ID_HEADER = "x-request-id";

/**
 * Methods that require CSRF validation
 */
const CSRF_PROTECTED_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

/**
 * Paths exempt from CSRF validation:
 * - NextAuth routes handle their own CSRF
 * - Health checks are read-only
 * - Integration endpoints (Discord, Slack) authenticate via their own
 *   mechanisms (shared token / HMAC signature) and are called by external
 *   services that cannot send a browser-originated CSRF cookie.
 */
const CSRF_EXEMPT_PATHS = ["/api/auth", "/api/health", "/api/integrations"];

/**
 * Extract client IP from request headers
 */
function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  return "unknown";
}

/**
 * Create a rate limit exceeded response
 */
function rateLimitExceededResponse(
  headers: Record<string, string>,
  resetAt: number,
  requestId: string,
): NextResponse {
  const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
  return new NextResponse(
    JSON.stringify({
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests. Please try again later.",
        retryAfter,
      },
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
        [REQUEST_ID_HEADER]: requestId,
        ...headers,
      },
    },
  );
}

/**
 * Create a CSRF validation failed response
 */
function csrfFailedResponse(reason: string, requestId: string): NextResponse {
  return new NextResponse(
    JSON.stringify({
      error: {
        code: "CSRF_VALIDATION_FAILED",
        message: reason,
      },
    }),
    {
      status: 403,
      headers: {
        "Content-Type": "application/json",
        [REQUEST_ID_HEADER]: requestId,
      },
    },
  );
}

/**
 * Check if path is exempt from CSRF validation
 */
function isCsrfExempt(pathname: string): boolean {
  return CSRF_EXEMPT_PATHS.some((exempt) => pathname.startsWith(exempt));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Generate or extract request ID for tracing
  const requestId =
    request.headers.get(REQUEST_ID_HEADER) ??
    request.headers.get("x-correlation-id") ??
    request.headers.get("x-trace-id") ??
    randomUUID();

  // Only apply to API routes
  if (!pathname.startsWith("/api")) {
    const response = NextResponse.next();
    response.headers.set(REQUEST_ID_HEADER, requestId);
    // Set CSRF cookie on page requests so it's available before the first
    // mutation API call (avoids a chicken-and-egg problem on first load).
    const isSecure = request.nextUrl.protocol === "https:";
    const cookieHeader = request.headers.get("cookie");
    const existingToken = getCsrfTokenFromCookie(cookieHeader);
    if (!existingToken) {
      const newToken = generateCsrfToken();
      response.headers.set("Set-Cookie", createCsrfCookieHeader(newToken, isSecure));
    }
    return response;
  }

  const isSecure = request.nextUrl.protocol === "https:";
  const cookieHeader = request.headers.get("cookie");
  const existingToken = getCsrfTokenFromCookie(cookieHeader);

  // CSRF validation for protected methods
  if (CSRF_PROTECTED_METHODS.includes(request.method) && !isCsrfExempt(pathname)) {
    const validation = validateCsrfToken(cookieHeader, request.headers);
    if (!validation.valid) {
      return csrfFailedResponse(validation.reason ?? "CSRF validation failed", requestId);
    }
  }

  // Skip rate limiting for health checks
  if (pathname === "/api/health") {
    const response = NextResponse.next();
    response.headers.set(REQUEST_ID_HEADER, requestId);
    // Ensure CSRF cookie is set
    if (!existingToken) {
      const newToken = generateCsrfToken();
      response.headers.set("Set-Cookie", createCsrfCookieHeader(newToken, isSecure));
    }
    return response;
  }

  // Rate limiting
  const clientIp = getClientIp(request);
  const config = getRateLimitConfig(pathname);
  const endpointCategory = pathname.split("/").slice(0, 4).join("/");
  const key = `${clientIp}:${endpointCategory}`;

  const result = rateLimiter.check(key, config);

  if (!result.allowed) {
    return rateLimitExceededResponse(getRateLimitHeaders(result), result.resetAt, requestId);
  }

  // Build response with rate limit headers and request ID
  const response = NextResponse.next();
  response.headers.set(REQUEST_ID_HEADER, requestId);
  const headers = getRateLimitHeaders(result);
  for (const [headerName, headerValue] of Object.entries(headers)) {
    response.headers.set(headerName, headerValue);
  }

  // Set CSRF cookie if not present
  if (!existingToken) {
    const newToken = generateCsrfToken();
    response.headers.append("Set-Cookie", createCsrfCookieHeader(newToken, isSecure));
  }

  return response;
}

export const config = {
  matcher: ["/api/:path*", "/((?!_next/static|_next/image|favicon.ico).*)"],
};

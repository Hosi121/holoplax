import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  createCsrfCookieHeader,
  generateCsrfToken,
  getCsrfTokenFromCookie,
  validateCsrfToken,
} from "./lib/csrf";
import { getRateLimitConfig, getRateLimitHeaders, rateLimiter } from "./lib/rate-limiter";

/**
 * Methods that require CSRF validation
 */
const CSRF_PROTECTED_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

/**
 * Paths exempt from CSRF validation
 * - NextAuth routes handle their own CSRF
 * - Health checks are read-only
 */
const CSRF_EXEMPT_PATHS = ["/api/auth", "/api/health"];

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
function rateLimitExceededResponse(headers: Record<string, string>, resetAt: number): NextResponse {
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
        ...headers,
      },
    },
  );
}

/**
 * Create a CSRF validation failed response
 */
function csrfFailedResponse(reason: string): NextResponse {
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

  // Only apply to API routes
  if (!pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const isSecure = request.nextUrl.protocol === "https:";
  const cookieHeader = request.headers.get("cookie");
  const existingToken = getCsrfTokenFromCookie(cookieHeader);

  // CSRF validation for protected methods
  if (CSRF_PROTECTED_METHODS.includes(request.method) && !isCsrfExempt(pathname)) {
    const validation = validateCsrfToken(cookieHeader, request.headers);
    if (!validation.valid) {
      return csrfFailedResponse(validation.reason ?? "CSRF validation failed");
    }
  }

  // Skip rate limiting for health checks
  if (pathname === "/api/health") {
    const response = NextResponse.next();
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
    return rateLimitExceededResponse(getRateLimitHeaders(result), result.resetAt);
  }

  // Build response with rate limit headers
  const response = NextResponse.next();
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
  matcher: ["/api/:path*"],
};

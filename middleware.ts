import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getRateLimitConfig, getRateLimitHeaders, rateLimiter } from "./lib/rate-limiter";

/**
 * Extract client IP from request headers
 */
function getClientIp(request: NextRequest): string {
  // Check various headers that might contain the real IP
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs; take the first one
    return forwardedFor.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // Fallback to a default value
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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only apply rate limiting to API routes
  if (!pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Skip rate limiting for health checks
  if (pathname === "/api/health") {
    return NextResponse.next();
  }

  const clientIp = getClientIp(request);
  const config = getRateLimitConfig(pathname);

  // Create a key based on IP and endpoint category
  const endpointCategory = pathname.split("/").slice(0, 4).join("/");
  const key = `${clientIp}:${endpointCategory}`;

  const result = rateLimiter.check(key, config);

  if (!result.allowed) {
    return rateLimitExceededResponse(getRateLimitHeaders(result), result.resetAt);
  }

  // Add rate limit headers to successful responses
  const response = NextResponse.next();
  const headers = getRateLimitHeaders(result);
  for (const [headerName, headerValue] of Object.entries(headers)) {
    response.headers.set(headerName, headerValue);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all API routes except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/api/:path*",
  ],
};

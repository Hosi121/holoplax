import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import {
  createCsrfCookieHeader,
  generateCsrfToken,
  getCsrfTokenFromCookie,
  validateCsrfToken,
} from "./lib/csrf";
import { getRateLimitConfig, getRateLimitHeaders, rateLimiter } from "./lib/rate-limiter";

const REQUEST_ID_HEADER = "x-request-id";

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

const PUBLIC_PATHS = [
  "/auth/signin",
  "/auth/forgot",
  "/auth/reset",
  "/auth/verify",
  "/favicon.ico",
];

/**
 * Number of trusted reverse proxies in front of the app (e.g. 1 for a single
 * ALB, 2 for CloudFront → ALB). The client IP is read as the Nth entry from the
 * RIGHT of X-Forwarded-For, since each trusted proxy appends the address it saw.
 * Reading the right side (rather than the spoofable left-most value the client
 * can set) prevents attackers from forging a fresh rate-limit bucket per request.
 */
const TRUSTED_PROXY_COUNT = Math.max(1, Number(process.env.TRUSTED_PROXY_COUNT ?? "1") || 1);

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const hops = forwardedFor
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (hops.length > 0) {
      // Index from the right: with N trusted proxies the real client is at
      // position length - TRUSTED_PROXY_COUNT (clamped to the first hop).
      const index = Math.max(0, hops.length - TRUSTED_PROXY_COUNT);
      return hops[index];
    }
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }
  return "unknown";
}

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
        details: { retryAfter },
        timestamp: new Date().toISOString(),
        requestId,
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

function csrfFailedResponse(reason: string, requestId: string): NextResponse {
  return new NextResponse(
    JSON.stringify({
      error: {
        code: "CSRF_VALIDATION_FAILED",
        message: reason,
        timestamp: new Date().toISOString(),
        requestId,
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

function isCsrfExempt(pathname: string): boolean {
  return CSRF_EXEMPT_PATHS.some((exempt) => pathname.startsWith(exempt));
}

function ensureCsrfCookie(
  response: NextResponse,
  cookieHeader: string | null,
  isSecure: boolean,
): void {
  const existingToken = getCsrfTokenFromCookie(cookieHeader);
  if (!existingToken) {
    const newToken = generateCsrfToken();
    response.headers.append("Set-Cookie", createCsrfCookieHeader(newToken, isSecure));
  }
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const requestId =
    request.headers.get(REQUEST_ID_HEADER) ??
    request.headers.get("x-correlation-id") ??
    request.headers.get("x-trace-id") ??
    randomUUID();

  const isSecure = request.nextUrl.protocol === "https:";
  const cookieHeader = request.headers.get("cookie");

  // ── API routes: CSRF + rate limiting ──────────────────────────────────
  if (pathname.startsWith("/api")) {
    // CSRF validation for protected methods
    if (CSRF_PROTECTED_METHODS.includes(request.method) && !isCsrfExempt(pathname)) {
      const validation = validateCsrfToken(cookieHeader, request.headers);
      if (!validation.valid) {
        return csrfFailedResponse(validation.reason ?? "CSRF validation failed", requestId);
      }
    }

    // Health checks skip rate limiting
    if (pathname === "/api/health") {
      const response = NextResponse.next();
      response.headers.set(REQUEST_ID_HEADER, requestId);
      ensureCsrfCookie(response, cookieHeader, isSecure);
      return response;
    }

    // Rate limiting
    const clientIp = getClientIp(request);
    const rlConfig = getRateLimitConfig(pathname);
    const endpointCategory = pathname.split("/").slice(0, 4).join("/");
    const key = `${clientIp}:${endpointCategory}`;
    const result = rateLimiter.check(key, rlConfig);

    if (!result.allowed) {
      return rateLimitExceededResponse(getRateLimitHeaders(result), result.resetAt, requestId);
    }

    const response = NextResponse.next();
    response.headers.set(REQUEST_ID_HEADER, requestId);
    const headers = getRateLimitHeaders(result);
    for (const [headerName, headerValue] of Object.entries(headers)) {
      response.headers.set(headerName, headerValue);
    }
    ensureCsrfCookie(response, cookieHeader, isSecure);
    return response;
  }

  // ── Static assets / Next internals: pass through ──────────────────────
  // Match a known static-file extension at the end of the path rather than any
  // path that merely contains a "." (which would let a dotted page/route segment
  // bypass the auth redirect).
  const isStaticAsset =
    /\.(?:ico|png|jpg|jpeg|gif|webp|svg|css|js|map|woff2?|ttf|eot|txt|xml|json|webmanifest)$/i.test(
      pathname,
    ) || pathname.startsWith("/public");
  if (pathname.startsWith("/_next") || pathname.startsWith("/public") || isStaticAsset) {
    return NextResponse.next();
  }

  // ── Page routes: auth redirect + CSRF cookie ──────────────────────────
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    const response = NextResponse.next();
    response.headers.set(REQUEST_ID_HEADER, requestId);
    ensureCsrfCookie(response, cookieHeader, isSecure);
    return response;
  }

  const token = await getToken({ req: request });
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/signin";
    url.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  if (!token.onboardingCompletedAt && !pathname.startsWith("/onboarding")) {
    const url = request.nextUrl.clone();
    url.pathname = "/onboarding";
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();
  response.headers.set(REQUEST_ID_HEADER, requestId);
  ensureCsrfCookie(response, cookieHeader, isSecure);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

import { getRuntime } from "../server/runtime";

/**
 * Native Cloudflare rate limit policy for API endpoints
 *
 */

type RateLimitConfig = {
  /** Maximum requests allowed in the window */
  limit: number;
  /** Window size in milliseconds */
  windowMs: number;
};

// Default configurations for different endpoint types
export const RATE_LIMIT_CONFIGS = {
  // Strict limits for auth endpoints to prevent brute force
  auth: { limit: 5, windowMs: 60 * 1000 }, // 5 requests per minute
  authRegister: { limit: 3, windowMs: 60 * 1000 }, // 3 registrations per minute
  authReset: { limit: 3, windowMs: 60 * 1000 }, // 3 reset requests per minute
  // Session/provider discovery is performed by several mounted UI consumers
  // and is not a password-guessing surface.
  authSession: { limit: 120, windowMs: 60 * 1000 },

  // AI endpoints (expensive operations)
  ai: { limit: 20, windowMs: 60 * 1000 }, // 20 requests per minute

  // Standard API endpoints
  api: { limit: 100, windowMs: 60 * 1000 }, // 100 requests per minute

  // Admin endpoints
  admin: { limit: 30, windowMs: 60 * 1000 }, // 30 requests per minute
} as const;

/**
 * Determine the rate limit config based on the pathname
 */
export function getRateLimitConfig(pathname: string): RateLimitConfig {
  // Auth endpoints with strict limits
  if (pathname.startsWith("/api/auth/register")) {
    return RATE_LIMIT_CONFIGS.authRegister;
  }
  if (pathname.startsWith("/api/auth/request-reset") || pathname.startsWith("/api/auth/reset")) {
    return RATE_LIMIT_CONFIGS.authReset;
  }
  if (
    pathname.startsWith("/api/auth/session") ||
    pathname.startsWith("/api/auth/providers") ||
    pathname.startsWith("/api/auth/csrf")
  ) {
    return RATE_LIMIT_CONFIGS.authSession;
  }
  if (pathname.startsWith("/api/auth")) {
    return RATE_LIMIT_CONFIGS.auth;
  }

  // Password-change endpoint — treat like auth reset (brute-force target)
  if (pathname.startsWith("/api/account/password")) {
    return RATE_LIMIT_CONFIGS.authReset;
  }

  // AI endpoints
  if (pathname.startsWith("/api/ai") || pathname.startsWith("/api/delegations")) {
    return RATE_LIMIT_CONFIGS.ai;
  }

  // Admin endpoints
  if (pathname.startsWith("/api/admin")) {
    return RATE_LIMIT_CONFIGS.admin;
  }

  // Default API rate limit
  return RATE_LIMIT_CONFIGS.api;
}

/**
 * Get rate limit headers for response
 */
export function getRateLimitHeaders(result: {
  remaining: number;
  resetAt: number;
  limit: number;
}): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  };
}

export async function checkRateLimit(pathname: string, key: string) {
  const config = getRateLimitConfig(pathname);
  const env = getRuntime().env;
  const bindings: Record<number, RateLimit> = {
    3: env.RATE_LIMIT_3,
    5: env.RATE_LIMIT_5,
    20: env.RATE_LIMIT_20,
    30: env.RATE_LIMIT_30,
    100: env.RATE_LIMIT_100,
    120: env.RATE_LIMIT_120,
  };
  const result = await bindings[config.limit].limit({ key });
  return { allowed: result.success, limit: config.limit, resetAt: Date.now() + config.windowMs };
}

/**
 * In-memory rate limiter for API endpoints
 *
 * For production with multiple instances, consider using:
 * - Redis-based rate limiting (e.g., @upstash/ratelimit)
 * - AWS WAF rate limiting
 */

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

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

  // AI endpoints (expensive operations)
  ai: { limit: 20, windowMs: 60 * 1000 }, // 20 requests per minute

  // Standard API endpoints
  api: { limit: 100, windowMs: 60 * 1000 }, // 100 requests per minute

  // Admin endpoints
  admin: { limit: 30, windowMs: 60 * 1000 }, // 30 requests per minute
} as const;

class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Check if a request should be rate limited
   * @returns Object with allowed status and rate limit info
   */
  check(
    key: string,
    config: RateLimitConfig,
  ): {
    allowed: boolean;
    remaining: number;
    resetAt: number;
    limit: number;
  } {
    const now = Date.now();
    const entry = this.store.get(key);

    // No existing entry or window expired
    if (!entry || entry.resetAt <= now) {
      const resetAt = now + config.windowMs;
      this.store.set(key, { count: 1, resetAt });
      return {
        allowed: true,
        remaining: config.limit - 1,
        resetAt,
        limit: config.limit,
      };
    }

    // Window still active
    if (entry.count >= config.limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.resetAt,
        limit: config.limit,
      };
    }

    // Increment counter
    entry.count += 1;
    return {
      allowed: true,
      remaining: config.limit - entry.count,
      resetAt: entry.resetAt,
      limit: config.limit,
    };
  }

  /**
   * Get the key for rate limiting based on IP and optional user ID
   */
  static getKey(ip: string, endpoint: string, userId?: string): string {
    const base = userId ? `user:${userId}` : `ip:${ip}`;
    return `${base}:${endpoint}`;
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetAt <= now) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Clear all entries (useful for testing)
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Stop the cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();

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
  if (pathname.startsWith("/api/auth")) {
    return RATE_LIMIT_CONFIGS.auth;
  }

  // Password-change endpoint — treat like auth reset (brute-force target)
  if (pathname.startsWith("/api/account/password")) {
    return RATE_LIMIT_CONFIGS.authReset;
  }

  // AI endpoints
  if (pathname.startsWith("/api/ai")) {
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

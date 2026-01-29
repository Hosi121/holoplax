import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getRateLimitConfig,
  getRateLimitHeaders,
  RATE_LIMIT_CONFIGS,
  rateLimiter,
} from "../rate-limiter";

describe("rate-limiter", () => {
  beforeEach(() => {
    rateLimiter.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getRateLimitConfig", () => {
    it("should return auth config for /api/auth endpoints", () => {
      expect(getRateLimitConfig("/api/auth/signin")).toBe(RATE_LIMIT_CONFIGS.auth);
      expect(getRateLimitConfig("/api/auth/callback")).toBe(RATE_LIMIT_CONFIGS.auth);
    });

    it("should return authRegister config for /api/auth/register", () => {
      expect(getRateLimitConfig("/api/auth/register")).toBe(RATE_LIMIT_CONFIGS.authRegister);
    });

    it("should return authReset config for reset endpoints", () => {
      expect(getRateLimitConfig("/api/auth/request-reset")).toBe(RATE_LIMIT_CONFIGS.authReset);
      expect(getRateLimitConfig("/api/auth/reset")).toBe(RATE_LIMIT_CONFIGS.authReset);
    });

    it("should return ai config for /api/ai endpoints", () => {
      expect(getRateLimitConfig("/api/ai/suggest")).toBe(RATE_LIMIT_CONFIGS.ai);
      expect(getRateLimitConfig("/api/ai/score")).toBe(RATE_LIMIT_CONFIGS.ai);
    });

    it("should return admin config for /api/admin endpoints", () => {
      expect(getRateLimitConfig("/api/admin/users")).toBe(RATE_LIMIT_CONFIGS.admin);
      expect(getRateLimitConfig("/api/admin/ai")).toBe(RATE_LIMIT_CONFIGS.admin);
    });

    it("should return api config for other endpoints", () => {
      expect(getRateLimitConfig("/api/tasks")).toBe(RATE_LIMIT_CONFIGS.api);
      expect(getRateLimitConfig("/api/workspaces")).toBe(RATE_LIMIT_CONFIGS.api);
    });
  });

  describe("rateLimiter.check", () => {
    const config = { limit: 3, windowMs: 60000 };

    it("should allow requests under the limit", () => {
      const result1 = rateLimiter.check("test-key", config);
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(2);

      const result2 = rateLimiter.check("test-key", config);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(1);

      const result3 = rateLimiter.check("test-key", config);
      expect(result3.allowed).toBe(true);
      expect(result3.remaining).toBe(0);
    });

    it("should block requests over the limit", () => {
      rateLimiter.check("test-key", config);
      rateLimiter.check("test-key", config);
      rateLimiter.check("test-key", config);

      const result = rateLimiter.check("test-key", config);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("should reset after window expires", () => {
      rateLimiter.check("test-key", config);
      rateLimiter.check("test-key", config);
      rateLimiter.check("test-key", config);

      // Move time forward past the window
      vi.advanceTimersByTime(60001);

      const result = rateLimiter.check("test-key", config);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
    });

    it("should track different keys separately", () => {
      rateLimiter.check("key-1", config);
      rateLimiter.check("key-1", config);
      rateLimiter.check("key-1", config);

      // key-1 is now at limit
      expect(rateLimiter.check("key-1", config).allowed).toBe(false);

      // key-2 should still have full limit
      const result = rateLimiter.check("key-2", config);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
    });
  });

  describe("getRateLimitHeaders", () => {
    it("should return correct headers", () => {
      const now = Date.now();
      const result = {
        limit: 100,
        remaining: 95,
        resetAt: now + 60000,
      };

      const headers = getRateLimitHeaders(result);

      expect(headers["X-RateLimit-Limit"]).toBe("100");
      expect(headers["X-RateLimit-Remaining"]).toBe("95");
      expect(headers["X-RateLimit-Reset"]).toBe(String(Math.ceil((now + 60000) / 1000)));
    });
  });
});

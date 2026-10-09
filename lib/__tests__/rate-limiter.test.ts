import { describe, expect, it } from "vitest";
import { getRateLimitConfig, getRateLimitHeaders, RATE_LIMIT_CONFIGS } from "../rate-limiter";

describe("rate-limiter", () => {
  describe("getRateLimitConfig", () => {
    it("should return auth config for /api/auth endpoints", () => {
      expect(getRateLimitConfig("/api/auth/signin")).toBe(RATE_LIMIT_CONFIGS.auth);
      expect(getRateLimitConfig("/api/auth/callback")).toBe(RATE_LIMIT_CONFIGS.auth);
    });

    it("allows normal session and provider discovery traffic", () => {
      expect(getRateLimitConfig("/api/auth/session")).toBe(RATE_LIMIT_CONFIGS.authSession);
      expect(getRateLimitConfig("/api/auth/providers")).toBe(RATE_LIMIT_CONFIGS.authSession);
      expect(getRateLimitConfig("/api/auth/csrf")).toBe(RATE_LIMIT_CONFIGS.authSession);
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
      expect(getRateLimitConfig("/api/delegations")).toBe(RATE_LIMIT_CONFIGS.ai);
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

import { describe, expect, it } from "vitest";
import {
  createCsrfCookieHeader,
  generateCsrfToken,
  getCsrfTokenFromCookie,
  getCsrfTokenFromHeader,
  validateCsrfToken,
} from "../csrf";

describe("csrf", () => {
  describe("generateCsrfToken", () => {
    it("should generate a 64-character hex string", () => {
      const token = generateCsrfToken();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it("should generate unique tokens", () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateCsrfToken());
      }
      expect(tokens.size).toBe(100);
    });
  });

  describe("getCsrfTokenFromCookie", () => {
    it("should extract token from cookie header", () => {
      const token = "abc123";
      const cookieHeader = `csrf_token=${token}; other=value`;
      expect(getCsrfTokenFromCookie(cookieHeader)).toBe(token);
    });

    it("should return null for missing cookie", () => {
      const cookieHeader = "other=value; another=thing";
      expect(getCsrfTokenFromCookie(cookieHeader)).toBeNull();
    });

    it("should return null for null input", () => {
      expect(getCsrfTokenFromCookie(null)).toBeNull();
    });
  });

  describe("getCsrfTokenFromHeader", () => {
    it("should extract token from headers", () => {
      const headers = new Headers();
      headers.set("x-csrf-token", "mytoken");
      expect(getCsrfTokenFromHeader(headers)).toBe("mytoken");
    });

    it("should return null if header not present", () => {
      const headers = new Headers();
      expect(getCsrfTokenFromHeader(headers)).toBeNull();
    });
  });

  describe("validateCsrfToken", () => {
    it("should validate matching tokens", () => {
      const token = generateCsrfToken();
      const cookieHeader = `csrf_token=${token}`;
      const headers = new Headers();
      headers.set("x-csrf-token", token);

      const result = validateCsrfToken(cookieHeader, headers);
      expect(result.valid).toBe(true);
    });

    it("should reject mismatched tokens", () => {
      const cookieHeader = "csrf_token=token1";
      const headers = new Headers();
      headers.set("x-csrf-token", "token2");

      const result = validateCsrfToken(cookieHeader, headers);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("CSRF token mismatch");
    });

    it("should reject missing cookie token", () => {
      const headers = new Headers();
      headers.set("x-csrf-token", "token");

      const result = validateCsrfToken(null, headers);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("CSRF cookie not found");
    });

    it("should reject missing header token", () => {
      const cookieHeader = "csrf_token=token";
      const headers = new Headers();

      const result = validateCsrfToken(cookieHeader, headers);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("CSRF header not found");
    });
  });

  describe("createCsrfCookieHeader", () => {
    it("should create secure cookie header for HTTPS", () => {
      const header = createCsrfCookieHeader("mytoken", true);
      expect(header).toContain("csrf_token=mytoken");
      // Must NOT be HttpOnly: the double-submit pattern requires JS to read this cookie
      expect(header).not.toContain("HttpOnly");
      expect(header).toContain("SameSite=Strict");
      expect(header).toContain("Secure");
      expect(header).toContain("Path=/");
    });

    it("should create non-secure cookie header for HTTP", () => {
      const header = createCsrfCookieHeader("mytoken", false);
      expect(header).toContain("csrf_token=mytoken");
      // Must NOT be HttpOnly: the double-submit pattern requires JS to read this cookie
      expect(header).not.toContain("HttpOnly");
      expect(header).not.toContain("Secure");
    });
  });
});

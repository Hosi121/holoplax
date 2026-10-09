import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  closeSprint: vi.fn(),
  fetchAsset: vi.fn(),
}));
vi.mock("./runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./runtime")>()),
  getRuntime: () => ({ env: { ASSETS: { fetch: mocks.fetchAsset } } }),
}));
vi.mock("../lib/auth", () => ({ getSession: mocks.getSession, authOptions: {} }));
vi.mock("../lib/rate-limiter", () => ({
  checkRateLimit: async () => ({ allowed: true, limit: 100, resetAt: Date.now() + 60000 }),
}));
vi.mock("../lib/db", () => ({ default: {} }));
vi.mock("../lib/api-guards", () => ({
  requireWorkspaceAuth: async () => ({ userId: "user-1", workspaceId: "workspace-1" }),
}));
vi.mock("../modules/sprints/index.server", () => ({
  closeCurrentSprint: mocks.closeSprint,
}));

import { createApp } from "./app";

describe("HTTP routing and guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(null);
  });

  it("preserves the login callback for direct protected URLs", async () => {
    const response = await createApp().request("/backlog?q=test");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/auth/signin?callbackUrl=%2Fbacklog%3Fq%3Dtest");
    expect(response.headers.get("set-cookie")).toContain("csrf_token=");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("serves protected pages immediately for a signed-in user", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.fetchAsset.mockResolvedValue(new Response("<html></html>"));
    const response = await createApp().request("/backlog");
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it.each([
    ["/", "/backlog"],
    ["/onboarding", "/backlog"],
    ["/kanban", "/backlog?display=board"],
    ["/velocity", "/review#completion-pace"],
  ])("redirects the legacy page %s to %s", async (path, target) => {
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    const response = await createApp().request(path);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(target);
  });

  it("adds security headers to full Responses without replacing their cookies", async () => {
    const headers = new Headers({ "content-type": "text/html" });
    headers.append("set-cookie", "auth.session=value; HttpOnly; Path=/");
    headers.append("set-cookie", "auth.csrf=token; HttpOnly; Path=/");
    mocks.fetchAsset.mockResolvedValue(new Response("<html></html>", { headers }));
    const response = await createApp().request("/auth/signin");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("x-request-id")).toBeTruthy();
    const cookies = response.headers.getSetCookie();
    expect(cookies).toContain("auth.session=value; HttpOnly; Path=/");
    expect(cookies).toContain("auth.csrf=token; HttpOnly; Path=/");
    expect(cookies.filter((cookie) => cookie.startsWith("csrf_token="))).toHaveLength(1);
  });

  it("checks CSRF before executing a mutation", async () => {
    const response = await createApp().request("/api/tasks", { method: "POST", body: "{}" });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CSRF_VALIDATION_FAILED" },
    });
  });

  it("keeps missing APIs as JSON 404s instead of the SPA fallback", async () => {
    const response = await createApp().request("/api/missing-route");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("routes a static API before the adjacent parameter route", async () => {
    mocks.closeSprint.mockResolvedValue({ id: "sprint-1", status: "CLOSED" });
    const response = await createApp().request("/api/sprints/current", {
      method: "PATCH",
      headers: { cookie: "csrf_token=abc", "x-csrf-token": "abc" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-ratelimit-limit")).toBe("100");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(mocks.closeSprint).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "workspace-1",
    });
  });

  it("keeps supported methods and automatic OPTIONS on an existing API", async () => {
    const app = createApp();
    const options = await app.request("/api/sprints/current", { method: "OPTIONS" });
    expect(options.status).toBe(204);
    expect(options.headers.get("allow")).toBe("GET, HEAD, OPTIONS, PATCH, POST");
    const unsupported = await app.request("/api/sprints/current", {
      method: "DELETE",
      headers: { cookie: "csrf_token=abc", "x-csrf-token": "abc" },
    });
    expect(unsupported.status).toBe(405);
    expect(mocks.closeSprint).not.toHaveBeenCalled();
  });
});

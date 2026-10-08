import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findUser: vi.fn() }));
vi.mock("../auth", () => ({ getSession: mocks.getSession }));
vi.mock("../prisma", () => ({ default: { user: { findUnique: mocks.findUser } } }));

import { requireAuth } from "../api-auth";

describe("API authorization after the framework migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      user: { id: "user-1", role: "ADMIN", pwChangedAt: 1000 },
    });
    mocks.findUser.mockResolvedValue({
      role: "USER",
      disabledAt: null,
      passwordChangedAt: new Date(1000),
    });
  });

  it("uses the persisted role rather than stale token privileges", async () => {
    await expect(requireAuth()).resolves.toEqual({ userId: "user-1", role: "USER" });
  });

  it("invalidates sessions issued before a password change", async () => {
    mocks.findUser.mockResolvedValue({
      role: "USER",
      disabledAt: null,
      passwordChangedAt: new Date(2000),
    });
    await expect(requireAuth()).rejects.toThrow("credentials changed");
  });

  it("rejects a disabled account and an absent session", async () => {
    mocks.findUser.mockResolvedValue({
      role: "USER",
      disabledAt: new Date(),
      passwordChangedAt: null,
    });
    await expect(requireAuth()).rejects.toThrow("disabled");
    mocks.getSession.mockResolvedValue(null);
    await expect(requireAuth()).rejects.toThrow("unauthorized");
  });
});

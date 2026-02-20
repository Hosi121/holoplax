/**
 * Tests for Zod contract schemas.
 *
 * Key invariants being locked in:
 * 1. Unknown fields are STRIPPED (no .passthrough() leakage).
 * 2. Required fields are enforced.
 * 3. Business-rule constraints (enum values, MIME allowlist, etc.) are checked.
 */

import { describe, expect, it } from "vitest";
import { AuthRegisterSchema } from "../contracts/auth";
import { SprintStartSchema } from "../contracts/sprint";
import { ALLOWED_AVATAR_MIME_TYPES, AvatarUploadSchema } from "../contracts/storage";
import { TaskCreateSchema, TaskPointsSchema, TaskUpdateSchema } from "../contracts/task";
import { WorkspaceCreateSchema } from "../contracts/workspace";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function safeParseOk<T>(
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T } },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new Error(`Expected success but got failure for: ${JSON.stringify(value)}`);
  return result.data as T;
}

// ---------------------------------------------------------------------------
// Unknown-field stripping (the key invariant after removing .passthrough())
// ---------------------------------------------------------------------------

describe("contracts — unknown fields are stripped", () => {
  it("TaskCreateSchema strips unknown keys", () => {
    const input = {
      title: "My task",
      points: 3,
      __injected: "evil",
      extraField: 42,
    };
    const result = safeParseOk(TaskCreateSchema, input);
    expect(result).not.toHaveProperty("__injected");
    expect(result).not.toHaveProperty("extraField");
    expect(result.title).toBe("My task");
  });

  it("TaskUpdateSchema strips unknown keys", () => {
    const input = {
      title: "Updated",
      internalField: "should-be-stripped",
      anotherExtra: 99,
    };
    const result = safeParseOk(TaskUpdateSchema, input);
    expect(result).not.toHaveProperty("internalField");
    expect(result).not.toHaveProperty("anotherExtra");
    expect(result.title).toBe("Updated");
  });

  it("TaskUpdateSchema does NOT accept automationState (internal field)", () => {
    const input = {
      title: "hack",
      automationState: "SPLIT_PARENT",
    };
    const result = safeParseOk(TaskUpdateSchema, input);
    // automationState was removed from the schema; it should be stripped
    expect(result).not.toHaveProperty("automationState");
  });

  it("AuthRegisterSchema strips unknown keys", () => {
    const input = {
      email: "user@example.com",
      password: "securePass123",
      name: "Alice",
      role: "admin", // not in schema — should be stripped
      isAdmin: true, // not in schema — should be stripped
    };
    const result = safeParseOk(AuthRegisterSchema, input);
    expect(result).not.toHaveProperty("role");
    expect(result).not.toHaveProperty("isAdmin");
    expect(result.email).toBe("user@example.com");
  });

  it("WorkspaceCreateSchema strips unknown keys", () => {
    const input = {
      name: "My Workspace",
      ownerId: "abc", // not in schema
      secret: "leak", // not in schema
    };
    const result = safeParseOk(WorkspaceCreateSchema, input);
    expect(result).not.toHaveProperty("ownerId");
    expect(result).not.toHaveProperty("secret");
    expect(result.name).toBe("My Workspace");
  });

  it("SprintStartSchema strips unknown keys", () => {
    const input = {
      name: "Sprint 1",
      capacityPoints: 40,
      extra: "should-be-gone",
    };
    const result = safeParseOk(SprintStartSchema, input);
    expect(result).not.toHaveProperty("extra");
  });
});

// ---------------------------------------------------------------------------
// AvatarUploadSchema — MIME type allowlist
// ---------------------------------------------------------------------------

describe("AvatarUploadSchema", () => {
  it("accepts all allowed MIME types", () => {
    for (const mime of ALLOWED_AVATAR_MIME_TYPES) {
      const result = AvatarUploadSchema.safeParse({
        filename: "avatar.jpg",
        contentType: mime,
      });
      expect(result.success, `should accept ${mime}`).toBe(true);
    }
  });

  it("rejects disallowed MIME types", () => {
    const dangerous = [
      "text/html",
      "application/javascript",
      "image/svg+xml",
      "application/x-php",
      "text/plain",
      "",
      "   ",
    ];
    for (const mime of dangerous) {
      const result = AvatarUploadSchema.safeParse({
        filename: "avatar.jpg",
        contentType: mime,
      });
      expect(result.success, `should reject "${mime}"`).toBe(false);
    }
  });

  it("strips unknown fields", () => {
    const result = AvatarUploadSchema.safeParse({
      filename: "avatar.png",
      contentType: "image/png",
      malicious: "injected",
    });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("malicious");
  });

  it("rejects empty filename", () => {
    const result = AvatarUploadSchema.safeParse({
      filename: "",
      contentType: "image/png",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TaskPointsSchema — Fibonacci allowlist
// ---------------------------------------------------------------------------

describe("TaskPointsSchema", () => {
  it("accepts valid story points", () => {
    for (const pts of [1, 2, 3, 5, 8, 13, 21, 34]) {
      expect(TaskPointsSchema.safeParse(pts).success, `should accept ${pts}`).toBe(true);
    }
  });

  it("rejects arbitrary numbers", () => {
    for (const pts of [0, 4, 6, 7, 9, 100, -1, 1.5]) {
      expect(TaskPointsSchema.safeParse(pts).success, `should reject ${pts}`).toBe(false);
    }
  });

  it("coerces string numbers", () => {
    const result = TaskPointsSchema.safeParse("5");
    expect(result.success).toBe(true);
    expect(result.data).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// TaskCreateSchema — required fields
// ---------------------------------------------------------------------------

describe("TaskCreateSchema", () => {
  it("requires title", () => {
    const result = TaskCreateSchema.safeParse({ points: 3 });
    expect(result.success).toBe(false);
  });

  it("requires points", () => {
    const result = TaskCreateSchema.safeParse({ title: "Task" });
    expect(result.success).toBe(false);
  });

  it("accepts a minimal valid task", () => {
    const result = TaskCreateSchema.safeParse({ title: "Do the thing", points: 5 });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AuthRegisterSchema — required fields and format
// ---------------------------------------------------------------------------

describe("AuthRegisterSchema", () => {
  it("requires email and password", () => {
    expect(AuthRegisterSchema.safeParse({ name: "Alice" }).success).toBe(false);
    expect(AuthRegisterSchema.safeParse({ email: "a@b.com" }).success).toBe(false);
  });

  it("accepts valid credentials", () => {
    const result = AuthRegisterSchema.safeParse({
      email: "alice@example.com",
      password: "secret123",
    });
    expect(result.success).toBe(true);
  });
});

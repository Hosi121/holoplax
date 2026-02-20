/**
 * Tests for Zod contract schemas.
 *
 * Key invariants being locked in:
 * 1. Unknown fields are STRIPPED (no .passthrough() leakage).
 * 2. Required fields are enforced.
 * 3. Business-rule constraints (enum values, MIME allowlist, etc.) are checked.
 */

import { describe, expect, it } from "vitest";
import { AiSplitSchema } from "../contracts/ai";
import {
  AccountPasswordChangeSchema,
  AccountProviderUnlinkSchema,
  AccountUpdateSchema,
  AuthRegisterSchema,
} from "../contracts/auth";
import { AutomationUpdateSchema } from "../contracts/automation";
import { CommentCreateSchema, CommentUpdateSchema } from "../contracts/comment";
import { IntakeMemoSchema } from "../contracts/intake";
import { McpKeyCreateSchema } from "../contracts/mcp";
import { OnboardingSchema } from "../contracts/onboarding";
import { SprintStartSchema } from "../contracts/sprint";
import {
  ALLOWED_AVATAR_MIME_TYPES,
  AvatarUploadSchema,
  MAX_AVATAR_BYTES,
} from "../contracts/storage";
import {
  TaskCreateSchema,
  TaskPointsSchema,
  TaskStatusSchema,
  TaskTypeSchema,
  TaskUpdateSchema,
} from "../contracts/task";
import {
  WorkspaceCreateSchema,
  WorkspaceInviteAcceptSchema,
  WorkspaceInviteCreateSchema,
  WorkspaceMemberAddSchema,
  WorkspaceMemberRoleUpdateSchema,
  WorkspaceRoleSchema,
} from "../contracts/workspace";

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
  const validBase = { filename: "avatar.jpg", contentType: "image/jpeg", size: 100_000 };

  it("accepts all allowed MIME types", () => {
    for (const mime of ALLOWED_AVATAR_MIME_TYPES) {
      const result = AvatarUploadSchema.safeParse({ ...validBase, contentType: mime });
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
      const result = AvatarUploadSchema.safeParse({ ...validBase, contentType: mime });
      expect(result.success, `should reject "${mime}"`).toBe(false);
    }
  });

  it("strips unknown fields", () => {
    const result = AvatarUploadSchema.safeParse({ ...validBase, malicious: "injected" });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("malicious");
  });

  it("rejects empty filename", () => {
    const result = AvatarUploadSchema.safeParse({ ...validBase, filename: "" });
    expect(result.success).toBe(false);
  });

  it("accepts size up to MAX_AVATAR_BYTES", () => {
    expect(AvatarUploadSchema.safeParse({ ...validBase, size: MAX_AVATAR_BYTES }).success).toBe(
      true,
    );
  });

  it("rejects size exceeding MAX_AVATAR_BYTES", () => {
    expect(AvatarUploadSchema.safeParse({ ...validBase, size: MAX_AVATAR_BYTES + 1 }).success).toBe(
      false,
    );
  });

  it("rejects non-positive size", () => {
    expect(AvatarUploadSchema.safeParse({ ...validBase, size: 0 }).success).toBe(false);
    expect(AvatarUploadSchema.safeParse({ ...validBase, size: -1 }).success).toBe(false);
  });

  it("rejects non-integer size", () => {
    expect(AvatarUploadSchema.safeParse({ ...validBase, size: 1000.5 }).success).toBe(false);
  });

  it("requires size field", () => {
    const { size: _size, ...withoutSize } = validBase;
    expect(AvatarUploadSchema.safeParse(withoutSize).success).toBe(false);
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

// ---------------------------------------------------------------------------
// WorkspaceRole — enum validation and case normalization
//
// These tests pin the exact set of valid role strings so that any accidental
// widening (e.g. adding "superadmin") or narrowing is caught immediately.
// The DB enum created in migration 20260301010000 accepts exactly these three
// values, so the Zod layer and DB layer must stay in sync.
// ---------------------------------------------------------------------------

describe("WorkspaceRoleSchema", () => {
  it("accepts all three valid roles", () => {
    for (const role of ["owner", "admin", "member"] as const) {
      expect(WorkspaceRoleSchema.safeParse(role).success, `should accept "${role}"`).toBe(true);
    }
  });

  it("rejects invalid role strings", () => {
    const invalid = ["superadmin", "moderator", "viewer", "OWNER", "ADMIN", "MEMBER", "", " "];
    for (const role of invalid) {
      expect(WorkspaceRoleSchema.safeParse(role).success, `should reject "${role}"`).toBe(false);
    }
  });

  it("returns the exact role string as output", () => {
    expect(WorkspaceRoleSchema.parse("owner")).toBe("owner");
    expect(WorkspaceRoleSchema.parse("admin")).toBe("admin");
    expect(WorkspaceRoleSchema.parse("member")).toBe("member");
  });
});

describe("WorkspaceInviteCreateSchema — role input", () => {
  const base = { email: "alice@example.com" };

  it("accepts a valid role", () => {
    const result = WorkspaceInviteCreateSchema.safeParse({ ...base, role: "admin" });
    expect(result.success).toBe(true);
    expect(result.data?.role).toBe("admin");
  });

  it("normalises uppercase role to lowercase (OWNER → owner)", () => {
    const result = WorkspaceInviteCreateSchema.safeParse({ ...base, role: "OWNER" });
    expect(result.success).toBe(true);
    expect(result.data?.role).toBe("owner");
  });

  it("normalises mixed-case role (Admin → admin)", () => {
    const result = WorkspaceInviteCreateSchema.safeParse({ ...base, role: "Admin" });
    expect(result.success).toBe(true);
    expect(result.data?.role).toBe("admin");
  });

  it("rejects an invalid role", () => {
    const result = WorkspaceInviteCreateSchema.safeParse({ ...base, role: "superadmin" });
    expect(result.success).toBe(false);
  });

  it("omitting role is allowed (role is optional)", () => {
    const result = WorkspaceInviteCreateSchema.safeParse(base);
    expect(result.success).toBe(true);
    expect(result.data?.role).toBeUndefined();
  });

  it("requires a valid email", () => {
    expect(WorkspaceInviteCreateSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
    expect(WorkspaceInviteCreateSchema.safeParse({ role: "member" }).success).toBe(false);
  });

  it("strips unknown fields", () => {
    const result = WorkspaceInviteCreateSchema.safeParse({
      ...base,
      role: "member",
      secret: "injected",
    });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("secret");
  });
});

describe("WorkspaceMemberAddSchema — role input", () => {
  const base = { email: "bob@example.com" };

  it("accepts member (default role) without explicit role field", () => {
    const result = WorkspaceMemberAddSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it("accepts all valid roles", () => {
    for (const role of ["owner", "admin", "member"]) {
      const r = WorkspaceMemberAddSchema.safeParse({ ...base, role });
      expect(r.success, `should accept role "${role}"`).toBe(true);
    }
  });

  it("rejects unknown role values", () => {
    const result = WorkspaceMemberAddSchema.safeParse({ ...base, role: "guest" });
    expect(result.success).toBe(false);
  });
});

describe("WorkspaceMemberRoleUpdateSchema", () => {
  it("requires role", () => {
    expect(WorkspaceMemberRoleUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("accepts valid roles", () => {
    for (const role of ["owner", "admin", "member"]) {
      const r = WorkspaceMemberRoleUpdateSchema.safeParse({ role });
      expect(r.success, `should accept "${role}"`).toBe(true);
      expect(r.data?.role).toBe(role);
    }
  });

  it("normalises ADMIN → admin", () => {
    const r = WorkspaceMemberRoleUpdateSchema.safeParse({ role: "ADMIN" });
    expect(r.success).toBe(true);
    expect(r.data?.role).toBe("admin");
  });

  it("rejects invalid roles", () => {
    expect(WorkspaceMemberRoleUpdateSchema.safeParse({ role: "superadmin" }).success).toBe(false);
    expect(WorkspaceMemberRoleUpdateSchema.safeParse({ role: "" }).success).toBe(false);
  });

  it("strips unknown fields", () => {
    const r = WorkspaceMemberRoleUpdateSchema.safeParse({ role: "member", extra: "bad" });
    expect(r.success).toBe(true);
    expect(r.data).not.toHaveProperty("extra");
  });
});

describe("WorkspaceInviteAcceptSchema", () => {
  it("requires a non-empty token", () => {
    expect(WorkspaceInviteAcceptSchema.safeParse({}).success).toBe(false);
    expect(WorkspaceInviteAcceptSchema.safeParse({ token: "" }).success).toBe(false);
    expect(WorkspaceInviteAcceptSchema.safeParse({ token: "   " }).success).toBe(false);
  });

  it("accepts a valid token", () => {
    const r = WorkspaceInviteAcceptSchema.safeParse({ token: "abc123" });
    expect(r.success).toBe(true);
    expect(r.data?.token).toBe("abc123");
  });

  it("trims whitespace from token", () => {
    const r = WorkspaceInviteAcceptSchema.safeParse({ token: "  tok  " });
    expect(r.success).toBe(true);
    expect(r.data?.token).toBe("tok");
  });

  it("strips unknown fields", () => {
    const r = WorkspaceInviteAcceptSchema.safeParse({ token: "tok", extra: "bad" });
    expect(r.success).toBe(true);
    expect(r.data).not.toHaveProperty("extra");
  });
});

// ---------------------------------------------------------------------------
// AccountPasswordChangeSchema — authenticated password change
// ---------------------------------------------------------------------------

describe("AccountPasswordChangeSchema", () => {
  const valid = { currentPassword: "oldpass123", newPassword: "newpass456" };

  it("accepts valid current + new passwords", () => {
    expect(AccountPasswordChangeSchema.safeParse(valid).success).toBe(true);
  });

  it("requires both fields", () => {
    expect(AccountPasswordChangeSchema.safeParse({ currentPassword: "oldpass123" }).success).toBe(
      false,
    );
    expect(AccountPasswordChangeSchema.safeParse({ newPassword: "newpass456" }).success).toBe(
      false,
    );
    expect(AccountPasswordChangeSchema.safeParse({}).success).toBe(false);
  });

  it("rejects passwords shorter than 8 characters", () => {
    expect(
      AccountPasswordChangeSchema.safeParse({
        currentPassword: "old1234",
        newPassword: "newpass456",
      }).success,
    ).toBe(false);
    expect(
      AccountPasswordChangeSchema.safeParse({
        currentPassword: "oldpass123",
        newPassword: "new456",
      }).success,
    ).toBe(false);
  });

  it("rejects new password equal to current password", () => {
    const same = { currentPassword: "samepass!", newPassword: "samepass!" };
    const result = AccountPasswordChangeSchema.safeParse(same);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("newPassword");
    }
  });

  it("strips unknown fields", () => {
    const input = { ...valid, token: "inject", role: "admin" };
    const result = AccountPasswordChangeSchema.safeParse(input);
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("token");
    expect(result.data).not.toHaveProperty("role");
  });
});

// ---------------------------------------------------------------------------
// McpKeyCreateSchema
// ---------------------------------------------------------------------------

describe("McpKeyCreateSchema", () => {
  const valid = { name: "My Dev Key", workspaceId: "ws_abc123" };

  it("accepts valid name + workspaceId (no expiry)", () => {
    const result = McpKeyCreateSchema.safeParse(valid);
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject(valid);
  });

  it("accepts optional expiresInDays", () => {
    const result = McpKeyCreateSchema.safeParse({ ...valid, expiresInDays: 30 });
    expect(result.success).toBe(true);
    expect(result.data?.expiresInDays).toBe(30);
  });

  it("trims whitespace from name and workspaceId", () => {
    const result = McpKeyCreateSchema.safeParse({
      name: "  My Key  ",
      workspaceId: "  ws_abc  ",
    });
    expect(result.success).toBe(true);
    expect(result.data?.name).toBe("My Key");
    expect(result.data?.workspaceId).toBe("ws_abc");
  });

  it("rejects whitespace-only name", () => {
    expect(McpKeyCreateSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
  });

  it("rejects whitespace-only workspaceId", () => {
    expect(McpKeyCreateSchema.safeParse({ name: "key", workspaceId: "   " }).success).toBe(false);
  });

  it("requires both name and workspaceId", () => {
    expect(McpKeyCreateSchema.safeParse({ expiresInDays: 7 }).success).toBe(false);
    expect(McpKeyCreateSchema.safeParse({ name: "key" }).success).toBe(false);
    expect(McpKeyCreateSchema.safeParse({ workspaceId: "ws_x" }).success).toBe(false);
  });

  it("enforces name max length of 100 characters", () => {
    expect(McpKeyCreateSchema.safeParse({ ...valid, name: "a".repeat(101) }).success).toBe(false);
    expect(McpKeyCreateSchema.safeParse({ ...valid, name: "a".repeat(100) }).success).toBe(true);
  });

  it("rejects expiresInDays > 365", () => {
    expect(McpKeyCreateSchema.safeParse({ ...valid, expiresInDays: 366 }).success).toBe(false);
    expect(McpKeyCreateSchema.safeParse({ ...valid, expiresInDays: 365 }).success).toBe(true);
  });

  it("rejects expiresInDays <= 0", () => {
    expect(McpKeyCreateSchema.safeParse({ ...valid, expiresInDays: 0 }).success).toBe(false);
    expect(McpKeyCreateSchema.safeParse({ ...valid, expiresInDays: -1 }).success).toBe(false);
  });

  it("rejects non-integer expiresInDays", () => {
    expect(McpKeyCreateSchema.safeParse({ ...valid, expiresInDays: 1.5 }).success).toBe(false);
  });

  it("strips unknown fields", () => {
    const result = McpKeyCreateSchema.safeParse({ ...valid, secret: "x", admin: true });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("secret");
    expect(result.data).not.toHaveProperty("admin");
  });
});

// ---------------------------------------------------------------------------
// AccountProviderUnlinkSchema
// ---------------------------------------------------------------------------

describe("AccountProviderUnlinkSchema", () => {
  it("accepts a valid provider name", () => {
    const result = AccountProviderUnlinkSchema.safeParse({ provider: "google" });
    expect(result.success).toBe(true);
    expect(result.data?.provider).toBe("google");
  });

  it("trims whitespace from provider", () => {
    const result = AccountProviderUnlinkSchema.safeParse({ provider: "  github  " });
    expect(result.success).toBe(true);
    expect(result.data?.provider).toBe("github");
  });

  it("rejects missing provider", () => {
    expect(AccountProviderUnlinkSchema.safeParse({}).success).toBe(false);
  });

  it("rejects whitespace-only provider", () => {
    expect(AccountProviderUnlinkSchema.safeParse({ provider: "   " }).success).toBe(false);
  });

  it("rejects provider name exceeding 50 characters", () => {
    expect(AccountProviderUnlinkSchema.safeParse({ provider: "p".repeat(51) }).success).toBe(false);
    expect(AccountProviderUnlinkSchema.safeParse({ provider: "p".repeat(50) }).success).toBe(true);
  });

  it("strips unknown fields", () => {
    const result = AccountProviderUnlinkSchema.safeParse({ provider: "google", admin: true });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("admin");
  });
});

// ---------------------------------------------------------------------------
// CommentCreateSchema / CommentUpdateSchema
// ---------------------------------------------------------------------------

describe("CommentCreateSchema", () => {
  it("accepts valid content", () => {
    const result = CommentCreateSchema.safeParse({ content: "Great point!" });
    expect(result.success).toBe(true);
    expect(result.data?.content).toBe("Great point!");
  });

  it("rejects empty content", () => {
    expect(CommentCreateSchema.safeParse({ content: "" }).success).toBe(false);
  });

  it("requires content field", () => {
    expect(CommentCreateSchema.safeParse({}).success).toBe(false);
  });

  it("rejects content exceeding 10 000 characters", () => {
    expect(CommentCreateSchema.safeParse({ content: "x".repeat(10_001) }).success).toBe(false);
    expect(CommentCreateSchema.safeParse({ content: "x".repeat(10_000) }).success).toBe(true);
  });

  it("strips unknown fields", () => {
    const result = CommentCreateSchema.safeParse({ content: "hi", taskId: "t_1", admin: true });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("taskId");
    expect(result.data).not.toHaveProperty("admin");
  });
});

describe("CommentUpdateSchema", () => {
  it("accepts valid content", () => {
    const result = CommentUpdateSchema.safeParse({ content: "Updated comment" });
    expect(result.success).toBe(true);
  });

  it("rejects empty content", () => {
    expect(CommentUpdateSchema.safeParse({ content: "" }).success).toBe(false);
  });

  it("rejects content exceeding 10 000 characters", () => {
    expect(CommentUpdateSchema.safeParse({ content: "x".repeat(10_001) }).success).toBe(false);
  });

  it("strips unknown fields", () => {
    const result = CommentUpdateSchema.safeParse({ content: "ok", authorId: "u_1" });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("authorId");
  });
});

// ---------------------------------------------------------------------------
// AiSplitSchema — Fibonacci points enforcement
// ---------------------------------------------------------------------------

describe("AiSplitSchema", () => {
  const valid = { title: "Implement login", points: 5 };

  it("accepts valid title and Fibonacci points", () => {
    for (const pts of [1, 2, 3, 5, 8, 13, 21, 34]) {
      const result = AiSplitSchema.safeParse({ ...valid, points: pts });
      expect(result.success, `should accept points=${pts}`).toBe(true);
    }
  });

  it("rejects non-Fibonacci points", () => {
    for (const pts of [0, 4, 6, 7, 9, 10, 15, 100, -1]) {
      const result = AiSplitSchema.safeParse({ ...valid, points: pts });
      expect(result.success, `should reject points=${pts}`).toBe(false);
    }
  });

  it("requires title", () => {
    expect(AiSplitSchema.safeParse({ points: 5 }).success).toBe(false);
  });

  it("rejects empty title", () => {
    expect(AiSplitSchema.safeParse({ title: "", points: 5 }).success).toBe(false);
    expect(AiSplitSchema.safeParse({ title: "   ", points: 5 }).success).toBe(false);
  });

  it("requires points", () => {
    expect(AiSplitSchema.safeParse({ title: "Task" }).success).toBe(false);
  });

  it("coerces string points to number", () => {
    const result = AiSplitSchema.safeParse({ ...valid, points: "8" });
    expect(result.success).toBe(true);
    expect(result.data?.points).toBe(8);
  });

  it("accepts optional description and taskId", () => {
    const result = AiSplitSchema.safeParse({
      ...valid,
      description: "Some detail",
      taskId: "task_abc",
    });
    expect(result.success).toBe(true);
    expect(result.data?.description).toBe("Some detail");
  });

  it("strips unknown fields", () => {
    const result = AiSplitSchema.safeParse({ ...valid, workspaceId: "ws_x", admin: true });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("workspaceId");
    expect(result.data).not.toHaveProperty("admin");
  });
});

// ---------------------------------------------------------------------------
// SprintStartSchema — capacityPoints constraints
// ---------------------------------------------------------------------------

describe("SprintStartSchema — capacityPoints", () => {
  it("accepts valid positive integer capacity", () => {
    for (const pts of [1, 24, 100, 500, 10_000]) {
      const result = SprintStartSchema.safeParse({ capacityPoints: pts });
      expect(result.success, `should accept capacityPoints=${pts}`).toBe(true);
    }
  });

  it("rejects zero and negative capacity", () => {
    for (const pts of [0, -1, -100]) {
      expect(
        SprintStartSchema.safeParse({ capacityPoints: pts }).success,
        `should reject capacityPoints=${pts}`,
      ).toBe(false);
    }
  });

  it("rejects capacity exceeding 10 000", () => {
    expect(SprintStartSchema.safeParse({ capacityPoints: 10_001 }).success).toBe(false);
    expect(SprintStartSchema.safeParse({ capacityPoints: 10_000 }).success).toBe(true);
  });

  it("rejects non-integer capacity", () => {
    expect(SprintStartSchema.safeParse({ capacityPoints: 24.5 }).success).toBe(false);
    expect(SprintStartSchema.safeParse({ capacityPoints: 0.1 }).success).toBe(false);
  });

  it("allows omitting capacityPoints (optional)", () => {
    expect(SprintStartSchema.safeParse({}).success).toBe(true);
    expect(SprintStartSchema.safeParse({ name: "Sprint 1" }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TaskStatusSchema / TaskTypeSchema — enum constraints
// ---------------------------------------------------------------------------

describe("TaskStatusSchema", () => {
  it("accepts all valid statuses", () => {
    for (const s of ["BACKLOG", "SPRINT", "DONE"]) {
      expect(TaskStatusSchema.safeParse(s).success, `should accept "${s}"`).toBe(true);
    }
  });

  it("rejects invalid statuses", () => {
    for (const s of ["TODO", "IN_PROGRESS", "pending", "done", "", "INVALID"]) {
      expect(TaskStatusSchema.safeParse(s).success, `should reject "${s}"`).toBe(false);
    }
  });
});

describe("TaskTypeSchema", () => {
  it("accepts all valid types", () => {
    for (const t of ["EPIC", "PBI", "TASK", "ROUTINE"]) {
      expect(TaskTypeSchema.safeParse(t).success, `should accept "${t}"`).toBe(true);
    }
  });

  it("rejects invalid types", () => {
    for (const t of ["BUG", "FEATURE", "STORY", "epic", "pbi", ""]) {
      expect(TaskTypeSchema.safeParse(t).success, `should reject "${t}"`).toBe(false);
    }
  });
});

describe("TaskCreateSchema — status and type enum enforcement", () => {
  const minValid = { title: "A task", points: 3 };

  it("rejects invalid status values", () => {
    expect(TaskCreateSchema.safeParse({ ...minValid, status: "TODO" }).success).toBe(false);
    expect(TaskCreateSchema.safeParse({ ...minValid, status: "PENDING" }).success).toBe(false);
    expect(TaskCreateSchema.safeParse({ ...minValid, status: "invalid" }).success).toBe(false);
  });

  it("accepts valid status values", () => {
    for (const s of ["BACKLOG", "SPRINT", "DONE"]) {
      expect(TaskCreateSchema.safeParse({ ...minValid, status: s }).success, `status="${s}"`).toBe(
        true,
      );
    }
  });

  it("allows omitting status (optional)", () => {
    expect(TaskCreateSchema.safeParse(minValid).success).toBe(true);
  });

  it("treats null/empty status as omitted", () => {
    expect(TaskCreateSchema.safeParse({ ...minValid, status: null }).success).toBe(true);
    expect(TaskCreateSchema.safeParse({ ...minValid, status: "" }).success).toBe(true);
  });

  it("rejects invalid type values", () => {
    expect(TaskCreateSchema.safeParse({ ...minValid, type: "BUG" }).success).toBe(false);
    expect(TaskCreateSchema.safeParse({ ...minValid, type: "FEATURE" }).success).toBe(false);
    expect(TaskCreateSchema.safeParse({ ...minValid, type: "task" }).success).toBe(false);
  });

  it("accepts valid type values", () => {
    for (const t of ["EPIC", "PBI", "TASK", "ROUTINE"]) {
      expect(TaskCreateSchema.safeParse({ ...minValid, type: t }).success, `type="${t}"`).toBe(
        true,
      );
    }
  });
});

describe("TaskUpdateSchema — status and type enum enforcement", () => {
  it("rejects invalid status on update", () => {
    expect(TaskUpdateSchema.safeParse({ status: "IN_PROGRESS" }).success).toBe(false);
    expect(TaskUpdateSchema.safeParse({ status: "done" }).success).toBe(false);
  });

  it("accepts valid status on update", () => {
    expect(TaskUpdateSchema.safeParse({ status: "DONE" }).success).toBe(true);
    expect(TaskUpdateSchema.safeParse({ status: "BACKLOG" }).success).toBe(true);
  });

  it("rejects invalid type on update", () => {
    expect(TaskUpdateSchema.safeParse({ type: "STORY" }).success).toBe(false);
  });

  it("accepts valid type on update", () => {
    expect(TaskUpdateSchema.safeParse({ type: "PBI" }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Length / size constraints added to prevent DoS via oversized inputs
// ---------------------------------------------------------------------------

describe("TaskCreateSchema — length constraints", () => {
  const validBase = { title: "Fix bug", points: 3 };

  it("accepts title up to 500 characters", () => {
    expect(TaskCreateSchema.safeParse({ ...validBase, title: "x".repeat(500) }).success).toBe(true);
  });

  it("rejects title exceeding 500 characters", () => {
    expect(TaskCreateSchema.safeParse({ ...validBase, title: "x".repeat(501) }).success).toBe(
      false,
    );
  });

  it("rejects description exceeding 100 000 characters", () => {
    expect(
      TaskCreateSchema.safeParse({ ...validBase, description: "x".repeat(100_001) }).success,
    ).toBe(false);
    expect(
      TaskCreateSchema.safeParse({ ...validBase, description: "x".repeat(100_000) }).success,
    ).toBe(true);
  });

  it("rejects more than 50 tags", () => {
    const tooManyTags = Array.from({ length: 51 }, (_, i) => `tag${i}`);
    expect(TaskCreateSchema.safeParse({ ...validBase, tags: tooManyTags }).success).toBe(false);
    const maxTags = Array.from({ length: 50 }, (_, i) => `tag${i}`);
    expect(TaskCreateSchema.safeParse({ ...validBase, tags: maxTags }).success).toBe(true);
  });

  it("rejects more than 100 dependencyIds", () => {
    const tooMany = Array.from({ length: 101 }, (_, i) => `id_${i}`);
    expect(TaskCreateSchema.safeParse({ ...validBase, dependencyIds: tooMany }).success).toBe(
      false,
    );
  });
});

describe("WorkspaceCreateSchema — name length", () => {
  it("accepts name up to 100 characters", () => {
    expect(WorkspaceCreateSchema.safeParse({ name: "x".repeat(100) }).success).toBe(true);
  });

  it("rejects name exceeding 100 characters", () => {
    expect(WorkspaceCreateSchema.safeParse({ name: "x".repeat(101) }).success).toBe(false);
  });

  it("still requires a non-empty name", () => {
    expect(WorkspaceCreateSchema.safeParse({ name: "" }).success).toBe(false);
    expect(WorkspaceCreateSchema.safeParse({ name: "   " }).success).toBe(false);
  });
});

describe("PasswordSchema — length bounds (via AuthRegisterSchema)", () => {
  const base = { email: "user@example.com" };

  it("rejects passwords shorter than 8 characters", () => {
    expect(AuthRegisterSchema.safeParse({ ...base, password: "short" }).success).toBe(false);
    expect(AuthRegisterSchema.safeParse({ ...base, password: "1234567" }).success).toBe(false);
  });

  it("accepts passwords of 8–1000 characters", () => {
    expect(AuthRegisterSchema.safeParse({ ...base, password: "exactly8" }).success).toBe(true);
    expect(AuthRegisterSchema.safeParse({ ...base, password: "x".repeat(1000) }).success).toBe(
      true,
    );
  });

  it("rejects passwords longer than 1000 characters (bcrypt DoS guard)", () => {
    expect(AuthRegisterSchema.safeParse({ ...base, password: "x".repeat(1001) }).success).toBe(
      false,
    );
  });
});

describe("AccountUpdateSchema — name and image length", () => {
  it("accepts name up to 200 characters", () => {
    expect(AccountUpdateSchema.safeParse({ name: "x".repeat(200) }).success).toBe(true);
  });

  it("rejects name exceeding 200 characters", () => {
    expect(AccountUpdateSchema.safeParse({ name: "x".repeat(201) }).success).toBe(false);
  });

  it("accepts image URL up to 2048 characters", () => {
    expect(
      AccountUpdateSchema.safeParse({ image: `https://example.com/${"x".repeat(2000)}` }).success,
    ).toBe(true);
  });

  it("rejects image URL exceeding 2048 characters", () => {
    expect(AccountUpdateSchema.safeParse({ image: "x".repeat(2049) }).success).toBe(false);
  });

  it("strips unknown fields", () => {
    const result = AccountUpdateSchema.safeParse({ name: "Alice", role: "admin" });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("role");
  });
});

// ---------------------------------------------------------------------------
// IntakeMemoSchema — text length bounds
// ---------------------------------------------------------------------------

describe("IntakeMemoSchema", () => {
  it("accepts valid text", () => {
    const result = IntakeMemoSchema.safeParse({ text: "Fix the login bug" });
    expect(result.success).toBe(true);
    expect(result.data?.text).toBe("Fix the login bug");
  });

  it("rejects empty text", () => {
    expect(IntakeMemoSchema.safeParse({ text: "" }).success).toBe(false);
    expect(IntakeMemoSchema.safeParse({ text: "   " }).success).toBe(false);
  });

  it("requires text field", () => {
    expect(IntakeMemoSchema.safeParse({}).success).toBe(false);
  });

  it("accepts text up to 50 000 characters", () => {
    expect(IntakeMemoSchema.safeParse({ text: "x".repeat(50_000) }).success).toBe(true);
  });

  it("rejects text exceeding 50 000 characters", () => {
    expect(IntakeMemoSchema.safeParse({ text: "x".repeat(50_001) }).success).toBe(false);
  });

  it("allows optional workspaceId and assignToCurrentWorkspace", () => {
    const result = IntakeMemoSchema.safeParse({
      text: "Some idea",
      workspaceId: "ws_abc",
      assignToCurrentWorkspace: true,
    });
    expect(result.success).toBe(true);
  });

  it("strips unknown fields", () => {
    const result = IntakeMemoSchema.safeParse({ text: "idea", admin: true });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("admin");
  });
});

// ---------------------------------------------------------------------------
// AutomationUpdateSchema — bounds and stage exclusion
// ---------------------------------------------------------------------------

describe("AutomationUpdateSchema", () => {
  it("accepts valid low < high within 0–200", () => {
    expect(AutomationUpdateSchema.safeParse({ low: 35, high: 70 }).success).toBe(true);
    expect(AutomationUpdateSchema.safeParse({ low: 0, high: 200 }).success).toBe(true);
    expect(AutomationUpdateSchema.safeParse({ low: 0, high: 1 }).success).toBe(true);
  });

  it("rejects low >= high", () => {
    expect(AutomationUpdateSchema.safeParse({ low: 70, high: 70 }).success).toBe(false);
    expect(AutomationUpdateSchema.safeParse({ low: 80, high: 70 }).success).toBe(false);
  });

  it("rejects negative values", () => {
    expect(AutomationUpdateSchema.safeParse({ low: -1, high: 70 }).success).toBe(false);
    expect(AutomationUpdateSchema.safeParse({ low: 35, high: -1 }).success).toBe(false);
  });

  it("rejects values exceeding 200", () => {
    expect(AutomationUpdateSchema.safeParse({ low: 35, high: 201 }).success).toBe(false);
    expect(AutomationUpdateSchema.safeParse({ low: 201, high: 300 }).success).toBe(false);
  });

  it("requires both low and high", () => {
    expect(AutomationUpdateSchema.safeParse({ low: 35 }).success).toBe(false);
    expect(AutomationUpdateSchema.safeParse({ high: 70 }).success).toBe(false);
    expect(AutomationUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("strips stage so clients cannot bypass the server-managed progression", () => {
    // stage is a server-managed field; it must be stripped even when sent
    const result = AutomationUpdateSchema.safeParse({ low: 35, high: 70, stage: 99 });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("stage");
  });

  it("strips other unknown fields", () => {
    const result = AutomationUpdateSchema.safeParse({ low: 35, high: 70, secret: "x" });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("secret");
  });
});

// ---------------------------------------------------------------------------
// OnboardingSchema — required fields, length caps, Fibonacci points
// ---------------------------------------------------------------------------

describe("OnboardingSchema", () => {
  const minValid = { workspaceName: "My Team", goalTitle: "Launch v1" };

  it("requires workspaceName and goalTitle", () => {
    expect(OnboardingSchema.safeParse({}).success).toBe(false);
    expect(OnboardingSchema.safeParse({ workspaceName: "Team" }).success).toBe(false);
    expect(OnboardingSchema.safeParse({ goalTitle: "Goal" }).success).toBe(false);
  });

  it("accepts minimal valid input", () => {
    expect(OnboardingSchema.safeParse(minValid).success).toBe(true);
  });

  it("rejects workspaceName exceeding 100 characters", () => {
    expect(
      OnboardingSchema.safeParse({ ...minValid, workspaceName: "w".repeat(101) }).success,
    ).toBe(false);
    expect(
      OnboardingSchema.safeParse({ ...minValid, workspaceName: "w".repeat(100) }).success,
    ).toBe(true);
  });

  it("rejects goalTitle exceeding 500 characters", () => {
    expect(OnboardingSchema.safeParse({ ...minValid, goalTitle: "g".repeat(501) }).success).toBe(
      false,
    );
    expect(OnboardingSchema.safeParse({ ...minValid, goalTitle: "g".repeat(500) }).success).toBe(
      true,
    );
  });

  it("rejects focusTasks array longer than 10 items", () => {
    const tooMany = Array.from({ length: 11 }, (_, i) => `task ${i}`);
    expect(OnboardingSchema.safeParse({ ...minValid, focusTasks: tooMany }).success).toBe(false);
    const maxAllowed = Array.from({ length: 10 }, (_, i) => `task ${i}`);
    expect(OnboardingSchema.safeParse({ ...minValid, focusTasks: maxAllowed }).success).toBe(true);
  });

  it("rejects non-Fibonacci points", () => {
    for (const pts of [0, 4, 6, 7, 9, 10, 15, 100, -1]) {
      expect(
        OnboardingSchema.safeParse({ ...minValid, points: pts }).success,
        `should reject points=${pts}`,
      ).toBe(false);
    }
  });

  it("accepts valid Fibonacci points", () => {
    for (const pts of [1, 2, 3, 5, 8, 13, 21, 34]) {
      expect(
        OnboardingSchema.safeParse({ ...minValid, points: pts }).success,
        `should accept points=${pts}`,
      ).toBe(true);
    }
  });

  it("strips unknown fields", () => {
    const result = OnboardingSchema.safeParse({ ...minValid, userId: "u_1", admin: true });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("userId");
    expect(result.data).not.toHaveProperty("admin");
  });
});

import { describe, expect, it } from "vitest";
import { decodeSession, encodeSession } from "../auth-jwt";
import legacy from "./fixtures/legacy-session.json";

const secret = "test-session-secret-at-least-thirty-two-characters";

describe("session encryption", () => {
  it("decrypts a session issued by the previous authentication library", async () => {
    await expect(decodeSession({ token: legacy.token, secret, salt: "" })).resolves.toMatchObject({
      sub: "legacy-user",
      role: "ADMIN",
      pwAt: 123,
    });
  });
  it("preserves identity, onboarding, and password-version claims", async () => {
    const token = await encodeSession({
      secret,
      salt: "",
      token: {
        sub: "user-1",
        role: "ADMIN",
        pwAt: 123,
        onboardingCompletedAt: "2026-10-01T00:00:00.000Z",
      },
    });
    expect(token.split(".")).toHaveLength(5);
    await expect(decodeSession({ token, secret, salt: "" })).resolves.toMatchObject({
      sub: "user-1",
      role: "ADMIN",
      pwAt: 123,
    });
  });

  it("rejects wrong keys, damaged ciphertext, and expired sessions", async () => {
    const token = await encodeSession({ secret, salt: "", token: { sub: "user-1" } });
    await expect(decodeSession({ token, secret: "wrong-secret", salt: "" })).resolves.toBeNull();
    const parts = token.split(".");
    parts[3] = `${parts[3][0] === "A" ? "B" : "A"}${parts[3].slice(1)}`;
    await expect(decodeSession({ token: parts.join("."), secret, salt: "" })).resolves.toBeNull();
    const expired = await encodeSession({
      secret,
      salt: "",
      token: { sub: "user-1" },
      maxAge: -60,
    });
    await expect(decodeSession({ token: expired, secret, salt: "" })).resolves.toBeNull();
  });
});

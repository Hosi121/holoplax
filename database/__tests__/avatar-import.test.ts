import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { avatarUrlUpdates, validateAvatarManifest, verifyAvatarBytes } from "../avatar-import";

test("rewrites only verified objects from the explicit source origin, preserving unrelated images", async () => {
  const bytes = new TextEncoder().encode("image bytes");
  const manifest = validateAvatarManifest({
    oldPublicBaseUrl: "https://old.example/bucket",
    appUrl: "https://app.example",
    objects: [
      {
        key: "avatars/user/photo.png",
        file: "photo.png",
        contentType: "image/png",
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
    ],
  });
  await verifyAvatarBytes(manifest.objects[0], bytes);
  await expect(
    verifyAvatarBytes(manifest.objects[0], new TextEncoder().encode("different")),
  ).rejects.toThrow("checksum mismatch");
  const updates = avatarUrlUpdates(manifest, [
    { id: "user", image: "https://old.example/bucket/avatars/user/photo.png" },
    { id: "oauth", image: "https://other.example/photo.png" },
  ]);
  expect(updates).toHaveLength(1);
  expect(updates[0]).toContain("https://app.example/avatars/avatars/user/photo.png");
  expect(() =>
    avatarUrlUpdates(manifest, [
      { id: "missing", image: "https://old.example/bucket/avatars/user/missing.png" },
    ]),
  ).toThrow("Unverified avatar");
});

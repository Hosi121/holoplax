import { ALLOWED_AVATAR_MIME_TYPES, MAX_AVATAR_BYTES } from "../lib/contracts/storage";

type Avatar = { key: string; file: string; contentType: string; sha256: string };
export type AvatarManifest = { oldPublicBaseUrl: string; appUrl: string; objects: Avatar[] };
const sqlText = (value: string) => `'${value.replaceAll("'", "''")}'`;
export function validateAvatarManifest(input: unknown): AvatarManifest {
  if (
    !input ||
    typeof input !== "object" ||
    !("oldPublicBaseUrl" in input) ||
    !("appUrl" in input) ||
    !("objects" in input) ||
    typeof input.oldPublicBaseUrl !== "string" ||
    typeof input.appUrl !== "string" ||
    !Array.isArray(input.objects)
  )
    throw new Error("Invalid avatar manifest");
  for (const value of [input.oldPublicBaseUrl, input.appUrl]) {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error("Invalid public URL");
  }
  const keys = new Set<string>();
  const objects = input.objects.map((value: unknown) => {
    if (
      !value ||
      typeof value !== "object" ||
      !("key" in value) ||
      typeof value.key !== "string" ||
      !/^avatars\/[^/]+\/[^/]+$/.test(value.key) ||
      !("file" in value) ||
      typeof value.file !== "string" ||
      !("contentType" in value) ||
      typeof value.contentType !== "string" ||
      !(ALLOWED_AVATAR_MIME_TYPES as readonly string[]).includes(value.contentType) ||
      !("sha256" in value) ||
      typeof value.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.sha256)
    )
      throw new Error("Invalid avatar object");
    if (keys.has(value.key)) throw new Error(`Duplicate avatar key ${value.key}`);
    keys.add(value.key);
    return {
      key: value.key,
      file: value.file,
      contentType: value.contentType,
      sha256: value.sha256,
    };
  });
  return { oldPublicBaseUrl: input.oldPublicBaseUrl, appUrl: input.appUrl, objects };
}
export async function verifyAvatarBytes(object: Avatar, data: Uint8Array) {
  if (!data.byteLength || data.byteLength > MAX_AVATAR_BYTES)
    throw new Error(`Invalid avatar size ${object.key}`);
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(data));
  const sha256 = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  if (sha256 !== object.sha256) throw new Error(`Avatar checksum mismatch ${object.key}`);
}
// Call only after every manifest object has been copied and verified in the target R2 bucket.
export function avatarUrlUpdates(
  manifest: AvatarManifest,
  users: { id: string; image: string | null }[],
) {
  const base = new URL(manifest.oldPublicBaseUrl);
  const prefix = `${base.pathname.replace(/\/$/, "")}/`;
  const keys = new Set(manifest.objects.map((object) => object.key));
  const updates: string[] = [];
  for (const user of users) {
    if (!user.image) continue;
    let url: URL;
    try {
      url = new URL(user.image);
    } catch {
      continue;
    }
    if (url.origin !== base.origin || !url.pathname.startsWith(prefix)) continue;
    const key = url.pathname.slice(prefix.length).split("/").map(decodeURIComponent).join("/");
    if (!keys.has(key)) throw new Error(`Unverified avatar object for user ${user.id}`);
    const image = new URL(
      `/avatars/${key.split("/").map(encodeURIComponent).join("/")}`,
      manifest.appUrl,
    ).href;
    updates.push(
      `UPDATE "User" SET "image"=${sqlText(image)} WHERE "id"=${sqlText(user.id)} AND "image"=${sqlText(user.image)};`,
    );
  }
  return updates;
}

import { type JWTPayload, jwtVerify, SignJWT } from "jose";
import { webStream } from "../server/platform-stream";
import { getRuntime } from "../server/runtime";
import { getBaseUrl } from "./base-url";
import { ALLOWED_AVATAR_MIME_TYPES, MAX_AVATAR_BYTES } from "./contracts/storage";

const secret = () => new TextEncoder().encode(getRuntime().env.AUTH_SECRET);
export function getPublicObjectUrl(key: string): string {
  return new URL(`/avatars/${key.split("/").map(encodeURIComponent).join("/")}`, getBaseUrl()).href;
}
export async function createAvatarUploadUrl(input: {
  key: string;
  contentType: string;
  contentLength: number;
}): Promise<string> {
  const token = await new SignJWT(input)
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("avatar-upload")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret());
  const url = new URL("/api/storage/avatar/upload", getBaseUrl());
  url.searchParams.set("token", token);
  return url.href;
}
export async function uploadAvatar(request: Request): Promise<Response> {
  let claim: JWTPayload;
  try {
    claim = (
      await jwtVerify(new URL(request.url).searchParams.get("token") ?? "", secret(), {
        audience: "avatar-upload",
        algorithms: ["HS256"],
      })
    ).payload;
  } catch {
    return Response.json(
      { error: { code: "STORAGE_INVALID_UPLOAD", message: "invalid or expired upload" } },
      { status: 403 },
    );
  }
  const { key, contentType, contentLength } = claim;
  if (
    typeof key !== "string" ||
    !/^avatars\/[^/]+\/[^/]+$/.test(key) ||
    typeof contentType !== "string" ||
    !(ALLOWED_AVATAR_MIME_TYPES as readonly string[]).includes(contentType) ||
    typeof contentLength !== "number" ||
    !Number.isInteger(contentLength) ||
    contentLength < 1 ||
    contentLength > MAX_AVATAR_BYTES
  )
    return new Response("Invalid upload", { status: 403 });
  if (request.headers.get("content-type") !== contentType)
    return new Response("Unexpected content type", { status: 400 });
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) !== contentLength)
    return new Response("Unexpected content length", { status: 400 });
  if (!request.body) return new Response("Missing upload body", { status: 400 });
  // A single avatar is bounded to 5 MiB. Stop reading as soon as the signed limit is exceeded.
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > contentLength) {
      await reader.cancel();
      return new Response("Upload too large", { status: 413 });
    }
    chunks.push(value);
  }
  if (size !== contentLength) return new Response("Unexpected content length", { status: 400 });
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const object = await getRuntime().env.AVATARS.put(key, body, {
    httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
    onlyIf: { etagDoesNotMatch: "*" },
  });
  return new Response(null, { status: object ? 200 : 409 });
}
export async function downloadAvatar(key: string): Promise<Response> {
  if (!/^avatars\/[^/]+\/[^/]+$/.test(key)) return new Response("Not found", { status: 404 });
  const object = await getRuntime().env.AVATARS.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers({
    "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: object.httpEtag,
    "X-Content-Type-Options": "nosniff",
  });
  return new Response(webStream(object.body), { headers });
}

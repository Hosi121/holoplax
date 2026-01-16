import { randomUUID } from "crypto";
import { requireAuth } from "../../../../lib/api-auth";
import { badRequest, handleAuthError, ok, serverError } from "../../../../lib/api-response";
import { createAvatarUploadUrl, ensureAvatarBucket, getPublicObjectUrl } from "../../../../lib/storage";

export async function POST(request: Request) {
  try {
    const { userId } = await requireAuth();
    const body = await request.json();
    const filename = String(body.filename ?? "").trim();
    const contentType = String(body.contentType ?? "").trim();
    if (!filename || !contentType) {
      return badRequest("filename and contentType are required");
    }

    await ensureAvatarBucket();
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `avatars/${userId}/${randomUUID()}-${safeName}`;
    const uploadUrl = await createAvatarUploadUrl({ key, contentType });
    const publicUrl = getPublicObjectUrl(key);
    return ok({ uploadUrl, publicUrl, key });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("POST /api/storage/avatar error", error);
    return serverError("failed to prepare upload");
  }
}

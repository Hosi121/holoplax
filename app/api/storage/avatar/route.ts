import { randomUUID } from "crypto";
import { requireAuth } from "../../../../lib/api-auth";
import { handleAuthError, ok } from "../../../../lib/api-response";
import { AvatarUploadSchema } from "../../../../lib/contracts/storage";
import { errorResponse } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import { createAvatarUploadUrl, ensureAvatarBucket, getPublicObjectUrl } from "../../../../lib/storage";

export async function POST(request: Request) {
  try {
    const { userId } = await requireAuth();
    const body = await parseBody(request, AvatarUploadSchema, {
      code: "STORAGE_VALIDATION",
    });
    const filename = body.filename;
    const contentType = body.contentType;

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
    return errorResponse(error, {
      code: "STORAGE_INTERNAL",
      message: "failed to prepare upload",
      status: 500,
    });
  }
}

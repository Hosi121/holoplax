import { NextResponse } from "next/server";
import { AuthError } from "./api-auth";
import { AppError, errorResponse as newErrorResponse } from "./http/errors";

export const ok = (data: unknown, init?: ResponseInit) => NextResponse.json(data, init);

export const handleAuthError = (error: unknown) =>
  error instanceof AuthError
    ? newErrorResponse(new AppError("AUTH_UNAUTHORIZED", error.message || "unauthorized", 401))
    : null;

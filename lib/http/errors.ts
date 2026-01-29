import { NextResponse } from "next/server";
import { ZodError } from "zod";

/**
 * Standard HTTP status codes
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details?: unknown;
    timestamp?: string;
    requestId?: string;
  };
};

type ErrorResult = {
  status: number;
  envelope: ErrorEnvelope;
};

export class AppError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const buildEnvelope = (
  code: string,
  message: string,
  details?: unknown,
  requestId?: string,
): ErrorEnvelope => {
  const envelope: ErrorEnvelope = {
    error: {
      code,
      message,
      timestamp: new Date().toISOString(),
    },
  };

  if (details !== undefined) {
    envelope.error.details = details;
  }

  if (requestId) {
    envelope.error.requestId = requestId;
  }

  return envelope;
};

export const toErrorResult = (
  error: unknown,
  fallback?: { code?: string; message?: string; status?: number; requestId?: string },
): ErrorResult => {
  if (error instanceof AppError) {
    return {
      status: error.status,
      envelope: buildEnvelope(error.code, error.message, error.details, fallback?.requestId),
    };
  }
  if (error instanceof ZodError) {
    return {
      status: HTTP_STATUS.BAD_REQUEST,
      envelope: buildEnvelope(
        fallback?.code ?? "VALIDATION_ERROR",
        fallback?.message ?? "invalid input",
        { issues: error.issues },
        fallback?.requestId,
      ),
    };
  }
  return {
    status: fallback?.status ?? HTTP_STATUS.INTERNAL_SERVER_ERROR,
    envelope: buildEnvelope(
      fallback?.code ?? "INTERNAL_ERROR",
      fallback?.message ?? "internal error",
      undefined,
      fallback?.requestId,
    ),
  };
};

export const errorResponse = (
  error: unknown,
  fallback?: { code?: string; message?: string; status?: number; requestId?: string },
) => {
  const { status, envelope } = toErrorResult(error, fallback);
  return NextResponse.json(envelope, { status });
};

export const createDomainErrors = (domain: string) => {
  const code = (suffix: string) => `${domain}_${suffix}`;
  return {
    badRequest: (message: string, details?: unknown) =>
      errorResponse(new AppError(code("BAD_REQUEST"), message, HTTP_STATUS.BAD_REQUEST, details)),
    unauthorized: (message = "unauthorized", details?: unknown) =>
      errorResponse(new AppError(code("UNAUTHORIZED"), message, HTTP_STATUS.UNAUTHORIZED, details)),
    forbidden: (message = "forbidden", details?: unknown) =>
      errorResponse(new AppError(code("FORBIDDEN"), message, HTTP_STATUS.FORBIDDEN, details)),
    notFound: (message = "not found", details?: unknown) =>
      errorResponse(new AppError(code("NOT_FOUND"), message, HTTP_STATUS.NOT_FOUND, details)),
    conflict: (message: string, details?: unknown) =>
      errorResponse(new AppError(code("CONFLICT"), message, HTTP_STATUS.CONFLICT, details)),
    unprocessable: (message: string, details?: unknown) =>
      errorResponse(
        new AppError(code("UNPROCESSABLE"), message, HTTP_STATUS.UNPROCESSABLE_ENTITY, details),
      ),
    tooManyRequests: (message = "too many requests", details?: unknown) =>
      errorResponse(
        new AppError(code("TOO_MANY_REQUESTS"), message, HTTP_STATUS.TOO_MANY_REQUESTS, details),
      ),
    internal: (message = "internal error", details?: unknown) =>
      errorResponse(
        new AppError(code("INTERNAL"), message, HTTP_STATUS.INTERNAL_SERVER_ERROR, details),
      ),
  };
};

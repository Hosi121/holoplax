import { handleAuthError } from "./api-response";
import { AppError, errorResponse } from "./http/errors";
import { logger } from "./logger";

type ErrorFallback = {
  code: string;
  message: string;
  status?: number;
};

type ApiHandlerOptions = {
  logLabel: string;
  errorFallback: ErrorFallback;
  requestId?: string;
};

export const withApiHandler = async (
  options: ApiHandlerOptions,
  handler: () => Promise<Response>,
): Promise<Response> => {
  try {
    return await handler();
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    // Thrown 4xx domain errors are expected client outcomes (mirroring the
    // createDomainErrors paths that return them without logging) — only log
    // genuine server failures at error level.
    const isExpectedClientError = error instanceof AppError && error.status < 500;
    if (!isExpectedClientError) {
      logger.error(
        `${options.logLabel} failed`,
        {
          requestId: options.requestId,
          code: options.errorFallback.code,
        },
        error,
      );
    }
    return errorResponse(error, options.errorFallback);
  }
};

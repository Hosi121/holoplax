import { handleAuthError } from "./api-response";
import { errorResponse } from "./http/errors";
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
    logger.error(
      `${options.logLabel} failed`,
      {
        requestId: options.requestId,
        code: options.errorFallback.code,
      },
      error,
    );
    return errorResponse(error, options.errorFallback);
  }
};

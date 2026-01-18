import { handleAuthError } from "./api-response";
import { errorResponse } from "./http/errors";

type ErrorFallback = {
  code: string;
  message: string;
  status?: number;
};

type ApiHandlerOptions = {
  logLabel: string;
  errorFallback: ErrorFallback;
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
    console.error(`${options.logLabel} error`, error);
    return errorResponse(error, options.errorFallback);
  }
};

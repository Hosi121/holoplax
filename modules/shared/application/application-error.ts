export type ApplicationErrorKind =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "unprocessable"
  | "rate_limited";

/**
 * A transport-independent expected use-case failure.
 *
 * Application and infrastructure code may throw this error without knowing
 * whether the caller is HTTP, MCP, a job, or a test. Each driving adapter maps
 * the semantic kind to its own protocol.
 */
export class ApplicationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly kind: ApplicationErrorKind,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApplicationError";
  }
}

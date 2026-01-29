/**
 * Structured logging utility for production environments
 *
 * Features:
 * - JSON formatted output for log aggregation (Datadog, CloudWatch, etc.)
 * - Log levels with environment-based filtering
 * - Request context (requestId, userId, workspaceId)
 * - Automatic timestamp and metadata
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

type LogContext = {
  requestId?: string;
  userId?: string;
  workspaceId?: string;
  [key: string]: unknown;
};

type LogEntry = {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
};

const getMinLevel = (): LogLevel => {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (env && env in LOG_LEVELS) {
    return env as LogLevel;
  }
  // Default: debug in development, info in production
  return process.env.NODE_ENV === "production" ? "info" : "debug";
};

const shouldLog = (level: LogLevel): boolean => {
  return LOG_LEVELS[level] >= LOG_LEVELS[getMinLevel()];
};

const formatError = (error: unknown): LogEntry["error"] | undefined => {
  if (!error) return undefined;
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === "production" ? undefined : error.stack,
    };
  }
  return {
    name: "UnknownError",
    message: String(error),
  };
};

const write = (entry: LogEntry): void => {
  const output = JSON.stringify(entry);

  switch (entry.level) {
    case "debug":
    case "info":
      // eslint-disable-next-line no-console
      console.log(output);
      break;
    case "warn":
      // eslint-disable-next-line no-console
      console.warn(output);
      break;
    case "error":
      // eslint-disable-next-line no-console
      console.error(output);
      break;
  }
};

const log = (level: LogLevel, message: string, context?: LogContext, error?: unknown): void => {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };

  if (context && Object.keys(context).length > 0) {
    entry.context = context;
  }

  const formattedError = formatError(error);
  if (formattedError) {
    entry.error = formattedError;
  }

  write(entry);
};

/**
 * Logger instance with level-specific methods
 */
export const logger = {
  debug: (message: string, context?: LogContext) => log("debug", message, context),
  info: (message: string, context?: LogContext) => log("info", message, context),
  warn: (message: string, context?: LogContext, error?: unknown) =>
    log("warn", message, context, error),
  error: (message: string, context?: LogContext, error?: unknown) =>
    log("error", message, context, error),
};

/**
 * Create a child logger with preset context
 * Useful for request-scoped logging
 */
export const createLogger = (baseContext: LogContext) => ({
  debug: (message: string, context?: LogContext) =>
    log("debug", message, { ...baseContext, ...context }),
  info: (message: string, context?: LogContext) =>
    log("info", message, { ...baseContext, ...context }),
  warn: (message: string, context?: LogContext, error?: unknown) =>
    log("warn", message, { ...baseContext, ...context }, error),
  error: (message: string, context?: LogContext, error?: unknown) =>
    log("error", message, { ...baseContext, ...context }, error),
});

export type Logger = typeof logger;

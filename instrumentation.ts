/**
 * Next.js Instrumentation
 *
 * This file runs once when the Next.js server starts.
 * Used for setting up global error handlers and monitoring.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on server
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logger } = await import("./lib/logger");

    // Handle unhandled promise rejections
    process.on("unhandledRejection", (reason, _promise) => {
      logger.error(
        "Unhandled Promise Rejection",
        {
          type: "unhandledRejection",
        },
        reason,
      );
    });

    // Handle uncaught exceptions
    process.on("uncaughtException", (error) => {
      logger.error(
        "Uncaught Exception",
        {
          type: "uncaughtException",
        },
        error,
      );
      // Let the process crash after logging
      process.exit(1);
    });

    logger.info("Server instrumentation initialized");
  }
}

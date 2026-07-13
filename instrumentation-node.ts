const instrumentationState = globalThis as typeof globalThis & {
  __holoplaxInstrumentationInitialized?: boolean;
};

/** Initialize process-wide diagnostics and background services once. */
export async function registerNodeInstrumentation() {
  const { logger } = await import("./lib/logger");

  if (!instrumentationState.__holoplaxInstrumentationInitialized) {
    process.on("unhandledRejection", (reason) => {
      logger.error("Unhandled Promise Rejection", { type: "unhandledRejection" }, reason);
    });
    process.on("uncaughtException", (error) => {
      logger.error("Uncaught Exception", { type: "uncaughtException" }, error);
      process.exit(1);
    });
    instrumentationState.__holoplaxInstrumentationInitialized = true;
  }

  if (process.env.NODE_ENV === "test" || process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }
  const [{ startDurableTaskAutomationWorker }, { startDurableDelegationWorker }] =
    await Promise.all([
      import("./modules/tasks/index.server"),
      import("./modules/delegation/index.server"),
    ]);
  startDurableTaskAutomationWorker();
  startDurableDelegationWorker();
  logger.info("Server instrumentation initialized");
}

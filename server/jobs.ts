import { logger } from "../lib/logger";
import { getRuntime } from "./runtime";
export function notifyJobs() {
  const { env, execution } = getRuntime();
  execution.waitUntil(
    env.JOBS.send({ type: "wake" }).catch((error) =>
      logger.error("Queue notification failed; cron will recover pending work", {}, error),
    ),
  );
}

import db from "../lib/db";
import { runDelegationJobs } from "../modules/delegation/infrastructure/delegation-worker";
import { runMetricScope } from "../modules/metrics/index.server";
import { runPendingTaskAutomation } from "../modules/tasks/index.server";
import { createApp } from "./app";
import { withRuntime } from "./runtime";

const app = createApp();
export default {
  fetch(request: Request, env: Env, execution: ExecutionContext) {
    return withRuntime(env, execution, () => app.fetch(request, env, execution));
  },
  async queue(batch: MessageBatch, env: Env, execution: ExecutionContext) {
    await withRuntime(env, execution, async () => {
      for (const message of batch.messages) {
        const body = message.body;
        if (body && typeof body === "object" && "type" in body && body.type === "metrics") {
          if (
            !("ownerId" in body) ||
            typeof body.ownerId !== "string" ||
            !("scope" in body) ||
            (body.scope !== "USER" && body.scope !== "WORKSPACE") ||
            !("asOf" in body) ||
            typeof body.asOf !== "number" ||
            !Number.isFinite(body.asOf)
          )
            throw new Error("Invalid metrics message");
          await runMetricScope(body.scope, body.ownerId, body.asOf);
        } else {
          await runPendingTaskAutomation({ limit: 5 });
          await runDelegationJobs(5);
        }
      }
    });
  },
  async scheduled(controller: ScheduledController, env: Env, execution: ExecutionContext) {
    await withRuntime(env, execution, async () => {
      if (controller.cron !== "0 0 * * *") {
        await env.JOBS.send({ type: "wake" });
        return;
      }
      // Each owner is processed independently so an account failure cannot abort the daily sweep.
      for (const scope of ["WORKSPACE", "USER"] as const) {
        for (let skip = 0; ; skip += 100) {
          const args = { select: { id: true }, orderBy: { id: "asc" }, take: 100, skip } as const;
          const owners =
            scope === "WORKSPACE"
              ? await db.workspace.findMany(args)
              : await db.user.findMany(args);
          if (!owners.length) break;
          await env.JOBS.sendBatch(
            owners.map((owner) => ({
              body: { type: "metrics", scope, ownerId: owner.id, asOf: controller.scheduledTime },
            })),
          );
          if (owners.length < 100) break;
        }
      }
    });
  },
};

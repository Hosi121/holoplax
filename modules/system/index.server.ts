import { runtimeEnv } from "../../server/runtime";
import { automationHealthThresholdsFromEnv, createHealthQuery } from "./application/health-query";
import { d1HealthQueryPort } from "./infrastructure/d1-health-query";

export const getSystemHealth = () =>
  createHealthQuery(d1HealthQueryPort, automationHealthThresholdsFromEnv(runtimeEnv))();

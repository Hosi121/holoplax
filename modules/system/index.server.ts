import { automationHealthThresholdsFromEnv, createHealthQuery } from "./application/health-query";
import { prismaHealthQueryPort } from "./infrastructure/prisma-health-query";

export const getSystemHealth = createHealthQuery(
  prismaHealthQueryPort,
  automationHealthThresholdsFromEnv(process.env),
);

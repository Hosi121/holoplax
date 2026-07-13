import { createHealthQuery } from "./application/health-query";
import { prismaHealthQueryPort } from "./infrastructure/prisma-health-query";

export const isDatabaseReachable = createHealthQuery(prismaHealthQueryPort);

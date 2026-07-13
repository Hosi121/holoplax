import prisma from "../../../lib/prisma";
import type { HealthQueryPort } from "../application/health-query";

export const prismaHealthQueryPort: HealthQueryPort = {
  async isDatabaseReachable() {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  },
};

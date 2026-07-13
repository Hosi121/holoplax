import { createVelocityQuery } from "./application/velocity-query";
import { prismaVelocityQueryPort } from "./infrastructure/prisma-velocity-query";

export const getVelocity = createVelocityQuery(prismaVelocityQueryPort);

import { createVelocityQuery } from "./application/velocity-query";
import { d1VelocityQueryPort } from "./infrastructure/d1-velocity-query";

export const getVelocity = createVelocityQuery(d1VelocityQueryPort);

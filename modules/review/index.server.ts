import { createReviewQuery } from "./application/review-query";
import { prismaReviewQueryPort } from "./infrastructure/prisma-review-query";

export const getReviewSnapshot = createReviewQuery(prismaReviewQueryPort);

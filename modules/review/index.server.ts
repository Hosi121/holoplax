import { createReviewQuery } from "./application/review-query";
import { d1ReviewQueryPort } from "./infrastructure/d1-review-query";

export const getReviewSnapshot = createReviewQuery(d1ReviewQueryPort);

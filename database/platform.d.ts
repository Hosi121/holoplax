// Import only binding types; Worker global fetch types must not override the browser DOM.
import type * as Workers from "@cloudflare/workers-types";
declare global {
  type D1Database = Workers.D1Database;
  type R2Bucket = Workers.R2Bucket;
  type Fetcher = Workers.Fetcher;
  type ExecutionContext = Workers.ExecutionContext;
  type ScheduledController = Workers.ScheduledController;
  type RateLimit = Workers.RateLimit;
  type Queue = Workers.Queue;
  type SendEmail = Workers.SendEmail;
  type MessageBatch<T = unknown> = Workers.MessageBatch<T>;
}

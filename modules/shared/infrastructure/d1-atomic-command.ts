import { Db } from "../../../database/models";
import db from "../../../lib/db";
import { ApplicationError } from "../application/application-error";

type AtomicOperation<T> = (tx: Db.TransactionClient) => Promise<T>;

export type CommandConflict = {
  code: string;
  message: string;
};

/** Commit a guarded D1 batch and map exhausted snapshot conflicts to HTTP 409. */
export async function runAtomicCommand<T>(
  operation: AtomicOperation<T>,
  conflict: CommandConflict,
  maxAttempts = 3,
): Promise<T> {
  const attempts = Math.max(1, Math.trunc(maxAttempts));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await db.command(operation, { maxAttempts: 1 });
    } catch (caught) {
      const serializationConflict =
        caught instanceof Db.DatabaseError && caught.code === "CONFLICT";
      if (serializationConflict && attempt + 1 < attempts) continue;
      if (serializationConflict) {
        throw new ApplicationError(conflict.code, conflict.message, "conflict");
      }
      throw caught;
    }
  }
  throw new Error("unreachable serializable transaction state");
}

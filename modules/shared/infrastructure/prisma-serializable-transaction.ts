import { Prisma } from "@prisma/client";
import prisma from "../../../lib/prisma";
import { ApplicationError } from "../application/application-error";

type SerializableOperation<T> = (tx: Prisma.TransactionClient) => Promise<T>;

export type SerializableConflict = {
  code: string;
  message: string;
};

/**
 * Execute a state-dependent command with bounded retries for PostgreSQL
 * serialization conflicts. Keeping this in one place ensures every module
 * maps an exhausted P2034 to a stable 409 instead of leaking a 500.
 */
export async function runSerializableTransaction<T>(
  operation: SerializableOperation<T>,
  conflict: SerializableConflict,
  maxAttempts = 3,
): Promise<T> {
  const attempts = Math.max(1, Math.trunc(maxAttempts));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: "Serializable" });
    } catch (caught) {
      const serializationConflict =
        caught instanceof Prisma.PrismaClientKnownRequestError && caught.code === "P2034";
      if (serializationConflict && attempt + 1 < attempts) continue;
      if (serializationConflict) {
        throw new ApplicationError(conflict.code, conflict.message, "conflict");
      }
      throw caught;
    }
  }
  throw new Error("unreachable serializable transaction state");
}

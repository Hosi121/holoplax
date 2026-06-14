import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import prisma from "./prisma";

export class AuthError extends Error {
  constructor(message = "unauthorized") {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * A session is stale when the user's password changed after the JWT was issued.
 * `sessionPwAt` is the pwChangedAt stamped into the token at sign-in (ms epoch,
 * or null/undefined for tokens issued before this field existed). Treating a
 * missing value as 0 means any later password change invalidates old tokens.
 */
const credentialsStale = (dbChangedAt: Date | null, sessionPwAt: unknown): boolean => {
  if (!dbChangedAt) return false;
  const sessionMs = typeof sessionPwAt === "number" ? sessionPwAt : 0;
  return dbChangedAt.getTime() > sessionMs;
};

export async function requireUserId() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    throw new AuthError();
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { disabledAt: true, passwordChangedAt: true },
  });
  if (!user) {
    throw new AuthError("user not found");
  }
  if (user?.disabledAt) {
    throw new AuthError("disabled");
  }
  if (credentialsStale(user.passwordChangedAt, session?.user?.pwChangedAt)) {
    throw new AuthError("credentials changed");
  }
  return userId;
}

export async function requireAuth() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    throw new AuthError();
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { disabledAt: true, role: true, passwordChangedAt: true },
  });
  if (!user) {
    throw new AuthError("user not found");
  }
  if (user?.disabledAt) {
    throw new AuthError("disabled");
  }
  if (credentialsStale(user.passwordChangedAt, session?.user?.pwChangedAt)) {
    throw new AuthError("credentials changed");
  }
  return { userId, role: user?.role ?? session?.user?.role ?? "USER" };
}

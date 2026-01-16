import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import prisma from "./prisma";

export class AuthError extends Error {
  constructor(message = "unauthorized") {
    super(message);
    this.name = "AuthError";
  }
}

export async function requireUserId() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    throw new AuthError();
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { disabledAt: true },
  });
  if (user?.disabledAt) {
    throw new AuthError("disabled");
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
    select: { disabledAt: true, role: true },
  });
  if (user?.disabledAt) {
    throw new AuthError("disabled");
  }
  return { userId, role: user?.role ?? session?.user?.role ?? "USER" };
}

import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

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
  return userId;
}

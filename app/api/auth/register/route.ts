import { hash } from "bcryptjs";
import { badRequest, conflict, ok, serverError } from "../../../../lib/api-response";
import prisma from "../../../../lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email ?? "").toLowerCase().trim();
    const password = String(body.password ?? "");
    const name = String(body.name ?? "").trim();

    if (!email || !password) {
      return badRequest("email and password are required");
    }
    if (password.length < 8) {
      return badRequest("password must be at least 8 characters");
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return conflict("email already registered");
    }

    const hashed = await hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        name: name || null,
        password: {
          create: { hash: hashed },
        },
      },
    });

    return ok({ id: user.id, email: user.email });
  } catch (error) {
    console.error("POST /api/auth/register error", error);
    return serverError("failed to register");
  }
}

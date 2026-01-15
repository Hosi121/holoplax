import { AuthError, requireAuth } from "../../../lib/api-auth";
import {
  badRequest,
  handleAuthError,
  ok,
  serverError,
} from "../../../lib/api-response";
import prisma from "../../../lib/prisma";
import { adoptOrphanVelocity } from "../../../lib/user-data";

export async function GET() {
  try {
    const { userId, role } = await requireAuth();
    if (role === "ADMIN") {
      const velocity = await prisma.velocityEntry.findMany({
        orderBy: { createdAt: "desc" },
      });
      return ok({ velocity });
    }
    await adoptOrphanVelocity(userId);
    const velocity = await prisma.velocityEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return ok({ velocity });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("GET /api/velocity error", error);
    return serverError("failed to load velocity");
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireAuth();
    const body = await request.json();
    const { name, points, range } = body;
    if (!name || !points || !range) {
      return badRequest("name, points, range are required");
    }
    const entry = await prisma.velocityEntry.create({
      data: {
        name,
        points: Number(points),
        range,
        userId,
      },
    });
    return ok({ entry });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("POST /api/velocity error", error);
    return serverError("failed to create entry");
  }
}

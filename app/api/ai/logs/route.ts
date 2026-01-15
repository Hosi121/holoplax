import { requireAuth } from "../../../../lib/api-auth";
import { handleAuthError, ok, serverError } from "../../../../lib/api-response";
import prisma from "../../../../lib/prisma";
import { adoptOrphanAiSuggestions } from "../../../../lib/user-data";

export async function GET() {
  try {
    const { userId, role } = await requireAuth();
    if (role === "ADMIN") {
      const logs = await prisma.aiSuggestion.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      return ok({ logs });
    }
    await adoptOrphanAiSuggestions(userId);
    const logs = await prisma.aiSuggestion.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return ok({ logs });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("GET /api/ai/logs error", error);
    return serverError("failed to load logs");
  }
}

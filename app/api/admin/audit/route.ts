import { requireAuth } from "../../../../lib/api-auth";
import {
  forbidden,
  handleAuthError,
  ok,
  serverError,
} from "../../../../lib/api-response";
import prisma from "../../../../lib/prisma";

const toNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export async function GET(request: Request) {
  try {
    const { role } = await requireAuth();
    if (role !== "ADMIN") {
      return forbidden();
    }
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get("filter");
    const where =
      filter === "ai"
        ? {
            action: { startsWith: "AI_" },
          }
        : {};
    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        actor: { select: { name: true, email: true } },
        targetUser: { select: { name: true, email: true } },
        targetWorkspace: { select: { name: true } },
      },
    });
    const stats = logs.reduce(
      (acc, log) => {
        if (!log.action.startsWith("AI_")) return acc;
        const meta =
          log.metadata && typeof log.metadata === "object"
            ? (log.metadata as Record<string, unknown>)
            : null;
        const model = typeof meta?.model === "string" ? meta.model : null;
        const provider = typeof meta?.provider === "string" ? meta.provider : null;
        const promptTokens = toNumber(meta?.promptTokens) ?? 0;
        const completionTokens = toNumber(meta?.completionTokens) ?? 0;
        const totalTokens = toNumber(meta?.totalTokens) ?? 0;
        const costUsd = toNumber(meta?.costUsd) ?? 0;

        acc.totalCostUsd += costUsd;
        acc.promptTokens += promptTokens;
        acc.completionTokens += completionTokens;
        acc.totalTokens += totalTokens;

        if (provider) {
          const bucket = acc.byProvider[provider] ?? {
            totalCostUsd: 0,
            totalTokens: 0,
          };
          bucket.totalCostUsd += costUsd;
          bucket.totalTokens += totalTokens;
          acc.byProvider[provider] = bucket;
        }

        if (model) {
          const bucket = acc.byModel[model] ?? {
            totalCostUsd: 0,
            totalTokens: 0,
          };
          bucket.totalCostUsd += costUsd;
          bucket.totalTokens += totalTokens;
          acc.byModel[model] = bucket;
        }

        return acc;
      },
      {
        totalCostUsd: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        byProvider: {} as Record<string, { totalCostUsd: number; totalTokens: number }>,
        byModel: {} as Record<string, { totalCostUsd: number; totalTokens: number }>,
      },
    );
    return ok({ logs, stats });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("GET /api/admin/audit error", error);
    return serverError("failed to load audit logs");
  }
}

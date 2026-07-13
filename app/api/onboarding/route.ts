import { NextResponse } from "next/server";
import { requireAuth } from "../../../lib/api-auth";
import { withApiHandler } from "../../../lib/api-handler";
import { ok } from "../../../lib/api-response";
import { OnboardingSchema } from "../../../lib/contracts/onboarding";
import { parseBody } from "../../../lib/http/validation";
import { completeOnboarding } from "../../../modules/onboarding/index.server";

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/onboarding",
      errorFallback: {
        code: "ONBOARDING_INTERNAL",
        message: "failed to complete onboarding",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAuth();
      const command = await parseBody(request, OnboardingSchema, {
        code: "ONBOARDING_VALIDATION",
      });
      const result = await completeOnboarding(userId, command);
      if (!result.created) return ok({ completedAt: result.completedAt });

      const response = NextResponse.json({
        workspaceId: result.workspaceId,
        completedAt: result.completedAt,
        starterTasksCreated: result.starterTasksCreated,
        starterTasksFailed: result.starterTasksFailed,
      });
      response.cookies.set("workspaceId", result.workspaceId, {
        path: "/",
        sameSite: "lax",
      });
      return response;
    },
  );
}

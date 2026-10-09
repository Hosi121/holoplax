import { Hono } from "hono";
import { getSession } from "../lib/auth";
import {
  createCsrfCookieHeader,
  generateCsrfToken,
  getCsrfTokenFromCookie,
  validateCsrfToken,
} from "../lib/csrf";
import { logger } from "../lib/logger";
import { checkRateLimit } from "../lib/rate-limiter";
import { downloadAvatar } from "../lib/storage";
import { handleMcpRequest } from "../mcp-server/src/worker-handler";
import { webStream } from "./platform-stream";
import { requestContext } from "./request-context";
import { registerRoutes } from "./route-table.generated";
import { getRuntime, runtimeEnv } from "./runtime";
import { getSecurityHeaders } from "./security-headers";

const mutations = ["POST", "PUT", "PATCH", "DELETE"];
const csrfExempt = ["/api/auth", "/api/health", "/api/storage/avatar/upload", "/mcp"];

export function createApp() {
  const app = new Hono<{ Variables: { requestId: string } }>();
  app.use("*", async (context, next) => {
    const request = context.req.raw;
    const pathname = context.req.path;
    const requestId =
      request.headers.get("x-request-id") ??
      request.headers.get("x-correlation-id") ??
      request.headers.get("x-trace-id") ??
      crypto.randomUUID();
    context.set("requestId", requestId);
    await next();
    // Apply headers to the final Response, preserving cookies returned by Auth.js.
    context.header("x-request-id", requestId);
    for (const { key, value } of getSecurityHeaders(
      Boolean(runtimeEnv.HOLOPLAX_DEV) && runtimeEnv.NODE_ENV !== "production",
    ))
      context.header(key, value);
    const secure = (runtimeEnv.APP_URL ?? runtimeEnv.NEXTAUTH_URL ?? request.url).startsWith(
      "https:",
    );
    if (!getCsrfTokenFromCookie(request.headers.get("cookie"))) {
      context.header("Set-Cookie", createCsrfCookieHeader(generateCsrfToken(), secure), {
        append: true,
      });
    }
    if (pathname.startsWith("/api/") || pathname === "/mcp") {
      context.header("Cache-Control", "no-store");
    }
  });
  app.use("*", async (context, next) => {
    const request = context.req.raw;
    const pathname = context.req.path;
    const requestId = context.get("requestId");
    let rateLimit: number | undefined;
    if (pathname.startsWith("/api/") || pathname === "/mcp") {
      if (
        mutations.includes(request.method) &&
        !csrfExempt.some((path) => pathname === path || pathname.startsWith(`${path}/`))
      ) {
        const validation = validateCsrfToken(request.headers.get("cookie"), request.headers);
        if (!validation.valid)
          return context.json(
            {
              error: {
                code: "CSRF_VALIDATION_FAILED",
                message: validation.reason,
                timestamp: new Date().toISOString(),
                requestId,
              },
            },
            403,
          );
      }
      if (pathname !== "/api/health") {
        const ip = request.headers.get("cf-connecting-ip") ?? "local";
        const key = `${ip}:${pathname.split("/").slice(0, 4).join("/")}`;
        const result = await checkRateLimit(pathname, key);
        rateLimit = result.limit;
        if (!result.allowed) {
          const retryAfter = Math.max(0, Math.ceil((result.resetAt - Date.now()) / 1000));
          context.header("X-RateLimit-Limit", String(result.limit));
          context.header("Retry-After", String(retryAfter));
          return context.json(
            {
              error: {
                code: "RATE_LIMIT_EXCEEDED",
                message: "Too many requests. Please try again later.",
                details: { retryAfter },
                timestamp: new Date().toISOString(),
                requestId,
              },
            },
            429,
          );
        }
      }
    } else {
      const asset =
        /\.(?:ico|png|jpg|jpeg|gif|webp|svg|css|js|map|woff2?|ttf|eot|txt|xml|json|webmanifest)$/i.test(
          pathname,
        );
      const devAsset =
        runtimeEnv.HOLOPLAX_DEV &&
        /^(?:\/@|\/node_modules\/|\/app\/|\/lib\/|\/modules\/)/.test(pathname);
      if (
        !asset &&
        !devAsset &&
        !pathname.startsWith("/auth/") &&
        !pathname.startsWith("/avatars/")
      ) {
        const session = await getSession(request);
        if (!session)
          return context.redirect(
            `/auth/signin?callbackUrl=${encodeURIComponent(pathname + new URL(request.url).search)}`,
          );
        if (
          !session.user?.onboardingCompletedAt &&
          pathname !== "/onboarding" &&
          pathname !== "/workspaces/invite"
        )
          return context.redirect("/onboarding");
        if (pathname === "/") return context.redirect("/delegate");
        if (pathname === "/velocity") return context.redirect("/review#completion-pace");
      }
    }
    await requestContext.run(request, next);
    if (rateLimit !== undefined) context.header("X-RateLimit-Limit", String(rateLimit));
  });
  app.all("/mcp", (context) => handleMcpRequest(context.req.raw));
  registerRoutes(app);
  app.all("/api/*", (context) =>
    context.json({ error: { code: "NOT_FOUND", message: "API route not found" } }, 404),
  );
  app.get("/avatars/*", (context) =>
    downloadAvatar(decodeURIComponent(context.req.path.slice("/avatars/".length))),
  );
  app.get("*", async (context) => {
    if (runtimeEnv.HOLOPLAX_DEV) {
      const url = new URL(context.req.url);
      return fetch(`http://127.0.0.1:5173${url.pathname}${url.search}`);
    }
    const asset = await getRuntime().env.ASSETS.fetch(context.req.url);
    const headers = new Headers();
    for (const [key, value] of asset.headers.entries()) {
      if (key.toLowerCase() !== "set-cookie") headers.set(key, value);
    }
    for (const cookie of asset.headers.getSetCookie()) headers.append("set-cookie", cookie);
    return new Response(asset.body ? webStream(asset.body) : null, {
      status: asset.status,
      headers,
    });
  });
  app.onError((error, context) => {
    logger.error("HTTP request failed", { path: context.req.path }, error);
    return context.json({ error: { code: "INTERNAL_ERROR", message: "internal error" } }, 500);
  });
  return app;
}

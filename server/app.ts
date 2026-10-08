import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { getSession } from "../lib/auth";
import {
  createCsrfCookieHeader,
  generateCsrfToken,
  getCsrfTokenFromCookie,
  validateCsrfToken,
} from "../lib/csrf";
import { logger } from "../lib/logger";
import { getRateLimitConfig, getRateLimitHeaders, rateLimiter } from "../lib/rate-limiter";
import { requestContext } from "./request-context";
import { registerRoutes } from "./route-table.generated";
import { securityHeaders } from "./security-headers";

const mutations = ["POST", "PUT", "PATCH", "DELETE"];
const csrfExempt = ["/api/auth", "/api/health", "/api/integrations"];
const trustedProxyCount = Math.max(1, Number(process.env.TRUSTED_PROXY_COUNT ?? "1") || 1);

export function createApp() {
  const app = new Hono();
  app.use("*", async (context, next) => {
    const request = context.req.raw;
    const pathname = context.req.path;
    const requestId =
      request.headers.get("x-request-id") ??
      request.headers.get("x-correlation-id") ??
      request.headers.get("x-trace-id") ??
      crypto.randomUUID();
    context.header("x-request-id", requestId);
    for (const { key, value } of securityHeaders) context.header(key, value);
    const secure = (process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? request.url).startsWith(
      "https:",
    );
    if (!getCsrfTokenFromCookie(request.headers.get("cookie"))) {
      context.header("Set-Cookie", createCsrfCookieHeader(generateCsrfToken(), secure), {
        append: true,
      });
    }
    if (pathname.startsWith("/api/")) {
      context.header("Cache-Control", "no-store");
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
        const hops = (request.headers.get("x-forwarded-for") ?? "")
          .split(",")
          .map((hop) => hop.trim())
          .filter(Boolean);
        const ip = hops.length
          ? hops[Math.max(0, hops.length - trustedProxyCount)]
          : (request.headers.get("x-real-ip") ?? "unknown");
        const key = `${ip}:${pathname.split("/").slice(0, 4).join("/")}`;
        const result = rateLimiter.check(key, getRateLimitConfig(pathname));
        for (const [key, value] of Object.entries(getRateLimitHeaders(result)))
          context.header(key, value);
        if (!result.allowed) {
          const retryAfter = Math.max(0, Math.ceil((result.resetAt - Date.now()) / 1000));
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
        process.env.HOLOPLAX_DEV &&
        /^(?:\/@|\/node_modules\/|\/app\/|\/lib\/|\/modules\/)/.test(pathname);
      if (!asset && !devAsset && !pathname.startsWith("/auth/")) {
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
    return requestContext.run(request, next);
  });
  registerRoutes(app);
  app.all("/api/*", (context) =>
    context.json({ error: { code: "NOT_FOUND", message: "API route not found" } }, 404),
  );
  if (process.env.HOLOPLAX_DEV) {
    app.get("*", async (context) => {
      const url = new URL(context.req.url);
      return fetch(`http://127.0.0.1:5173${url.pathname}${url.search}`);
    });
  } else {
    app.use("*", serveStatic({ root: "./dist/client" }));
    app.get("*", serveStatic({ root: "./dist/client", path: "index.html" }));
  }
  app.onError((error, context) => {
    logger.error("HTTP request failed", { path: context.req.path }, error);
    return context.json({ error: { code: "INTERNAL_ERROR", message: "internal error" } }, 500);
  });
  return app;
}

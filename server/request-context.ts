import { AsyncLocalStorage } from "node:async_hooks";

export const requestContext = new AsyncLocalStorage<Request>();

export function getRequest(): Request {
  const request = requestContext.getStore();
  if (!request) throw new Error("HTTP request context is unavailable");
  return request;
}

export function getRequestCookie(name: string): string | null {
  const cookies = getRequest().headers.get("cookie")?.split(";") ?? [];
  const value = cookies.find((cookie) => cookie.trim().startsWith(`${name}=`));
  if (!value) return null;
  try {
    return decodeURIComponent(value.trim().slice(name.length + 1));
  } catch {
    return null;
  }
}

export function setResponseCookie(
  response: Response,
  name: string,
  value: string,
  options: { path?: string; sameSite?: "lax" | "strict" | "none"; httpOnly?: boolean } = {},
): void {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path ?? "/"}`];
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if ((process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? getRequest().url).startsWith("https:"))
    parts.push("Secure");
  response.headers.append("Set-Cookie", parts.join("; "));
}

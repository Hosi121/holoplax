/**
 * API client with CSRF token support
 */

const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";

/**
 * Get CSRF token from cookie
 */
function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;

  const cookies = document.cookie.split(";").map((c) => c.trim());
  for (const cookie of cookies) {
    const [name, value] = cookie.split("=");
    if (name === CSRF_COOKIE_NAME) {
      return value;
    }
  }
  return null;
}

/**
 * Enhanced fetch that automatically includes CSRF token for state-changing requests
 */
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const method = (options.method ?? "GET").toUpperCase();
  const needsCsrf = ["POST", "PUT", "PATCH", "DELETE"].includes(method);

  const headers = new Headers(options.headers);

  // Add CSRF token for state-changing requests
  if (needsCsrf) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers.set(CSRF_HEADER_NAME, csrfToken);
    }
  }

  // Add Content-Type if body is present and not FormData
  if (options.body && !(options.body instanceof FormData)) {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
  }

  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * Helper for JSON API requests
 */
export async function apiJson<T>(
  url: string,
  options: Omit<RequestInit, "body"> & { body?: unknown } = {},
): Promise<{ data: T; response: Response }> {
  const response = await apiFetch(url, {
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json();
  return { data, response };
}

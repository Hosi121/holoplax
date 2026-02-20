/**
 * Returns the application base URL used to construct absolute links in emails
 * (password-reset, email-verification, workspace-invite, etc.).
 *
 * In production NEXTAUTH_URL must be explicitly set.  The localhost fallback
 * would produce unclickable links in any email client outside the server.
 * Throwing here lets the route's error boundary return a clear 500 rather than
 * silently emailing a localhost URL to users.
 *
 * In development/test the well-known Next.js dev-server URL is used as a
 * fallback so no extra configuration is needed.
 */
export function getBaseUrl(): string {
  const url = process.env.NEXTAUTH_URL;
  if (url) return url;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NEXTAUTH_URL must be set in production — omitting it would send email links pointing to localhost",
    );
  }

  return "http://localhost:3000";
}

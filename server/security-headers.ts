const cspDirectives = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

export const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // Kept for legacy browser compatibility; modern browsers use frame-ancestors in CSP
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    // Deprecated in modern browsers — CSP script-src is the recommended replacement
    key: "X-XSS-Protection",
    value: "1; mode=block",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Content-Security-Policy",
    value: cspDirectives,
  },
];

export function getSecurityHeaders(development: boolean) {
  return securityHeaders.map((header) =>
    development && header.key === "Content-Security-Policy"
      ? {
          ...header,
          value: header.value.replace(
            "connect-src 'self' https:",
            "connect-src 'self' https: ws://127.0.0.1:5173 ws://localhost:5173",
          ),
        }
      : header,
  );
}

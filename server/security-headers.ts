const storageOrigins = [process.env.MINIO_ENDPOINT, process.env.MINIO_PUBLIC_URL]
  .flatMap((value) => {
    if (!value) return [];
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:" ? [url.origin] : [];
    } catch {
      return [];
    }
  })
  .filter((value, index, values) => values.indexOf(value) === index);
const storageSources = storageOrigins.length ? ` ${storageOrigins.join(" ")}` : "";
const usesInsecureLocalStorage = storageOrigins.some((origin) => origin.startsWith("http://"));

const cspDirectives = [
  "default-src 'self'",
  process.env.HOLOPLAX_DEV
    ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
    : "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https:${storageSources}`,
  "font-src 'self' data:",
  // Avatar uploads use a short-lived pre-signed URL. Production targets S3
  // over HTTPS; localhost permits the development MinIO endpoint.
  `connect-src 'self' https:${storageSources}${process.env.HOLOPLAX_DEV ? " ws://localhost:5173 ws://127.0.0.1:5173" : ""}`,
  "frame-ancestors 'none'",
  "form-action 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  ...(process.env.NODE_ENV === "production" && !usesInsecureLocalStorage
    ? ["upgrade-insecure-requests"]
    : []),
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

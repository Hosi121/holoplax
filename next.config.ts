import type { NextConfig } from "next";

/**
 * Content-Security-Policy directives
 *
 * Notes:
 * - 'unsafe-inline' and 'unsafe-eval' in script-src are required by Next.js
 *   for hydration and hot-module replacement. Nonce-based CSP (for fully
 *   removing unsafe-inline) can be added as a future improvement via middleware.
 * - img-src allows 'https:' broadly to accommodate external profile images
 *   (Google, GitHub OAuth avatars) and MinIO/S3 avatar storage whose domain
 *   varies by deployment.
 * - frame-ancestors 'none' supersedes X-Frame-Options in modern browsers.
 * - object-src 'none' disables Flash/Java plugins entirely.
 * - base-uri 'self' prevents base-tag injection attacks.
 */
const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
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

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

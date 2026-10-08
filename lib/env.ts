/**
 * Environment variable validation
 * Validates required environment variables at startup
 */

type EnvVar = {
  key: string;
  required: boolean;
  description: string;
};

const envVars: EnvVar[] = [
  { key: "DATABASE_URL", required: true, description: "PostgreSQL connection URL" },
  {
    key: "AUTH_SECRET",
    required: true,
    description: "Session encryption secret (NEXTAUTH_SECRET also accepted)",
  },
  {
    key: "APP_URL",
    required: false,
    description: "Application public URL (NEXTAUTH_URL also accepted)",
  },
  { key: "ENCRYPTION_KEY", required: true, description: "AES-256 encryption key (64 hex chars)" },
  { key: "GOOGLE_CLIENT_ID", required: false, description: "Google OAuth client ID" },
  { key: "GOOGLE_CLIENT_SECRET", required: false, description: "Google OAuth client secret" },
  // NOTE: The GitHub provider reads GITHUB_ID / GITHUB_SECRET (not GITHUB_CLIENT_*)
  { key: "GITHUB_ID", required: false, description: "GitHub OAuth client ID" },
  { key: "GITHUB_SECRET", required: false, description: "GitHub OAuth client secret" },
  // Storage uses MinIO-compatible env vars (also compatible with AWS S3 via MINIO_* naming)
  { key: "MINIO_ENDPOINT", required: false, description: "S3-compatible storage endpoint" },
  { key: "MINIO_ROOT_USER", required: false, description: "S3/MinIO access key" },
  { key: "MINIO_ROOT_PASSWORD", required: false, description: "S3/MinIO secret key" },
  {
    key: "MINIO_BUCKET_AVATARS",
    required: false,
    description: "S3/MinIO bucket name for avatars",
  },
];

type ValidationResult = {
  valid: boolean;
  missing: string[];
  warnings: string[];
};

function validateEnv(): ValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const envVar of envVars) {
    const value =
      process.env[envVar.key] ??
      (envVar.key === "AUTH_SECRET"
        ? process.env.NEXTAUTH_SECRET
        : envVar.key === "APP_URL"
          ? process.env.NEXTAUTH_URL
          : undefined);
    if (envVar.required && !value) {
      missing.push(`${envVar.key}: ${envVar.description}`);
    } else if (!envVar.required && !value) {
      warnings.push(`${envVar.key}: ${envVar.description} (optional)`);
    }
  }

  // Special validation for ENCRYPTION_KEY format
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (encryptionKey && !/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
    missing.push("ENCRYPTION_KEY: must be exactly 64 hexadecimal characters");
  }

  // AUTH_SECRET encrypts JWT sessions — a weak/short secret enables forgery.
  const authSecretValue = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (authSecretValue && authSecretValue.length < 32) {
    missing.push("AUTH_SECRET: must be at least 32 characters");
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}

function assertEnv(): void {
  const result = validateEnv();

  if (!result.valid) {
    console.error("=".repeat(60));
    console.error("ENVIRONMENT VALIDATION FAILED");
    console.error("=".repeat(60));
    console.error("\nMissing required environment variables:\n");
    for (const msg of result.missing) {
      console.error(`  - ${msg}`);
    }
    console.error("\nPlease check your .env file or environment configuration.");
    console.error("=".repeat(60));

    if (process.env.NODE_ENV === "production") {
      throw new Error(`Missing required environment variables: ${result.missing.join(", ")}`);
    }
  }

  if (result.warnings.length > 0 && process.env.NODE_ENV !== "test") {
    console.warn("\nOptional environment variables not set:");
    for (const msg of result.warnings) {
      console.warn(`  - ${msg}`);
    }
  }
}

// Auto-validate on import in non-test environments
if (
  typeof window === "undefined" &&
  process.env.NODE_ENV !== "test" &&
  !process.env.SKIP_ENV_VALIDATION
) {
  assertEnv();
}

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
  { key: "NEXTAUTH_SECRET", required: true, description: "NextAuth.js secret key" },
  {
    key: "NEXTAUTH_URL",
    required: false,
    description: "NextAuth.js URL (auto-detected in Vercel)",
  },
  { key: "ENCRYPTION_KEY", required: true, description: "AES-256 encryption key (64 hex chars)" },
  { key: "GOOGLE_CLIENT_ID", required: false, description: "Google OAuth client ID" },
  { key: "GOOGLE_CLIENT_SECRET", required: false, description: "Google OAuth client secret" },
  { key: "GITHUB_CLIENT_ID", required: false, description: "GitHub OAuth client ID" },
  { key: "GITHUB_CLIENT_SECRET", required: false, description: "GitHub OAuth client secret" },
  { key: "S3_ENDPOINT", required: false, description: "S3-compatible storage endpoint" },
  { key: "S3_ACCESS_KEY", required: false, description: "S3 access key" },
  { key: "S3_SECRET_KEY", required: false, description: "S3 secret key" },
  { key: "S3_BUCKET", required: false, description: "S3 bucket name" },
];

type ValidationResult = {
  valid: boolean;
  missing: string[];
  warnings: string[];
};

export function validateEnv(): ValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const envVar of envVars) {
    const value = process.env[envVar.key];
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

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}

export function assertEnv(): void {
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
if (typeof window === "undefined" && process.env.NODE_ENV !== "test") {
  assertEnv();
}

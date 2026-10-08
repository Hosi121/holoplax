import { hkdfSync, randomUUID } from "node:crypto";
import type { JWTDecodeParams, JWTEncodeParams } from "@auth/core/jwt";
import { EncryptJWT, jwtDecrypt } from "jose";

// Preserve the existing session encryption format so deployment does not sign
// everybody out. The cookie names are preserved in auth.ts as well.
function sessionKey(secret: string) {
  return new Uint8Array(hkdfSync("sha256", secret, "", "NextAuth.js Generated Encryption Key", 32));
}

export async function encodeSession({
  token = {},
  secret,
  maxAge = 30 * 24 * 60 * 60,
}: JWTEncodeParams) {
  const key = sessionKey(Array.isArray(secret) ? secret[0] : secret);
  return new EncryptJWT(token)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + maxAge)
    .setJti(randomUUID())
    .encrypt(key);
}

export async function decodeSession({ token, secret }: JWTDecodeParams) {
  if (!token) return null;
  const secrets = Array.isArray(secret) ? secret : [secret];
  for (const value of secrets) {
    try {
      const { payload } = await jwtDecrypt(token, sessionKey(value), { clockTolerance: 15 });
      return payload;
    } catch {
      // A previous secret may still decrypt the token during key rotation.
    }
  }
  return null;
}

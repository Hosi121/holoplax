import type { AuthConfig } from "@auth/core";
import type { JWT } from "@auth/core/jwt";
import { getToken } from "@auth/core/jwt";
import CredentialsProvider from "@auth/core/providers/credentials";
import GitHubProvider from "@auth/core/providers/github";
import GoogleProvider from "@auth/core/providers/google";
import bcrypt from "bcryptjs";
import { getRequest } from "../server/request-context";
import { runtimeEnv } from "../server/runtime";
import { d1AuthAdapter } from "./auth-adapter";
import { decodeSession, encodeSession } from "./auth-jwt";
import db from "./db";
import type { Session } from "./session";

export function getAuthOptions(): AuthConfig {
  const providers = [];

  // A throwaway bcrypt hash used to equalize response time when a user/password
  // row is missing, so the credentials login path is not a username-enumeration
  // timing oracle (we always perform one bcrypt comparison).
  const DUMMY_PASSWORD_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

  providers.push(
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string" ? credentials.email.toLowerCase().trim() : null;
        const password = typeof credentials?.password === "string" ? credentials.password : null;
        if (!email || !password) return null;
        const user = await db.user.findUnique({
          where: { email },
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
            disabledAt: true,
            emailVerified: true,
            onboardingCompletedAt: true,
            passwordChangedAt: true,
          },
        });
        const passwordRow = user
          ? await db.userPassword.findUnique({ where: { userId: user.id } })
          : null;
        // Always run one bcrypt comparison (against a dummy hash when no row
        // exists) so timing does not reveal whether the account exists.
        const valid = await bcrypt.compare(password, passwordRow?.hash ?? DUMMY_PASSWORD_HASH);
        if (!user || user.disabledAt || !passwordRow || !user.emailVerified || !valid) {
          return null;
        }
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
          disabledAt: user.disabledAt,
          onboardingCompletedAt: user.onboardingCompletedAt,
          passwordChangedAt: user.passwordChangedAt,
        };
      },
    }),
  );

  if (runtimeEnv.GOOGLE_CLIENT_ID && runtimeEnv.GOOGLE_CLIENT_SECRET) {
    providers.push(
      GoogleProvider({
        clientId: runtimeEnv.GOOGLE_CLIENT_ID,
        clientSecret: runtimeEnv.GOOGLE_CLIENT_SECRET,
      }),
    );
  }

  if (runtimeEnv.GITHUB_ID && runtimeEnv.GITHUB_SECRET) {
    providers.push(
      GitHubProvider({
        clientId: runtimeEnv.GITHUB_ID,
        clientSecret: runtimeEnv.GITHUB_SECRET,
      }),
    );
  }

  const secureCookies = (runtimeEnv.APP_URL ?? runtimeEnv.NEXTAUTH_URL ?? "").startsWith("https:");
  const sessionCookieName = `${secureCookies ? "__Secure-" : ""}next-auth.session-token`;
  const authSecret = runtimeEnv.AUTH_SECRET ?? runtimeEnv.NEXTAUTH_SECRET;

  return {
    secret: authSecret,
    basePath: "/api/auth",
    trustHost: true,
    useSecureCookies: secureCookies,
    cookies: {
      sessionToken: {
        name: sessionCookieName,
        options: { httpOnly: true, sameSite: "lax", path: "/", secure: secureCookies },
      },
    },
    jwt: { encode: encodeSession, decode: decodeSession },
    adapter: d1AuthAdapter,
    providers,
    pages: {
      signIn: "/auth/signin",
      error: "/auth/error",
    },
    session: { strategy: "jwt" },
    callbacks: {
      jwt: async ({ token, user, trigger }) => {
        if (user) {
          token.sub = (user as { id?: string }).id ?? token.sub;
          token.role = (user as { role?: string }).role ?? "USER";
          token.name = user.name ?? token.name;
          token.email = user.email ?? token.email;
          token.picture = user.image ?? token.picture;
          token.disabledAt = (user as { disabledAt?: Date | null }).disabledAt ?? null;
          token.onboardingCompletedAt =
            (user as { onboardingCompletedAt?: Date | null }).onboardingCompletedAt ?? null;
          const pwChangedAt = (user as { passwordChangedAt?: Date | null }).passwordChangedAt;
          token.pwAt = pwChangedAt ? new Date(pwChangedAt).getTime() : null;
        }
        if (trigger === "update" && token.sub) {
          // Session updates refresh persisted facts; never trust browser-supplied
          // identity or onboarding flags as authorization data.
          const record = await db.user.findUnique({
            where: { id: token.sub },
            select: { name: true, email: true, image: true, onboardingCompletedAt: true },
          });
          if (record) {
            token.name = record.name;
            token.email = record.email;
            token.picture = record.image;
            token.onboardingCompletedAt = record.onboardingCompletedAt;
          }
        }
        if (!token.onboardingCompletedAt && token.sub) {
          const record = await db.user.findUnique({
            where: { id: token.sub },
            select: { onboardingCompletedAt: true },
          });
          token.onboardingCompletedAt = record?.onboardingCompletedAt ?? null;
        }
        return token;
      },
      signIn: async ({ user, account, profile }) => {
        if (account?.provider && account.provider !== "credentials") {
          const email = user?.email;
          if (!email) return false;

          const existingUser = await db.user.findUnique({
            where: { email },
            select: { id: true, disabledAt: true, emailVerified: true },
          });

          if (existingUser?.disabledAt) return false;

          const linkedAccount = await db.account.findUnique({
            where: {
              provider_providerAccountId: {
                provider: account.provider,
                providerAccountId: account.providerAccountId,
              },
            },
          });

          if (linkedAccount && linkedAccount.userId !== existingUser?.id) {
            return false;
          }

          if (existingUser) {
            if (linkedAccount) return true;

            // Only auto-link to an existing local account whose email is itself
            // verified — otherwise someone who registered with another person's
            // email could be hijacked. For Google we also require the provider's
            // verified-email signal. (Auth.js's GitHub provider only returns the
            // primary verified email, so the local-verified check covers it.)
            const providerEmailOk =
              account.provider === "github" ||
              (account.provider === "google" &&
                (profile as { email_verified?: boolean })?.email_verified === true);
            const canLink = providerEmailOk && existingUser.emailVerified !== null;

            if (!canLink) return false;

            await db.account.create({
              data: {
                userId: existingUser.id,
                type: account.type,
                provider: account.provider,
                providerAccountId: account.providerAccountId,
                refresh_token: account.refresh_token,
                access_token: account.access_token,
                expires_at: account.expires_at,
                token_type: account.token_type,
                scope: account.scope,
                id_token: account.id_token,
                session_state: account.session_state as string | null,
              },
            });
            return true;
          }

          return true;
        }

        if (!user?.id) return true;
        const record = await db.user.findUnique({
          where: { id: user.id as string },
          select: { disabledAt: true },
        });
        return !record?.disabledAt;
      },
      session: ({ session, token }) => ({
        ...session,
        user: {
          ...session.user,
          id: token.sub,
          role: (token as { role?: string }).role ?? "USER",
          name: token.name,
          email: token.email,
          image: token.picture as string | null | undefined,
          onboardingCompletedAt: (token as { onboardingCompletedAt?: Date | null })
            .onboardingCompletedAt,
          pwChangedAt: (token as { pwAt?: number | null }).pwAt ?? null,
        },
      }),
    },
  };
}

export function sessionFromToken(token: JWT): Session {
  return {
    expires: new Date((token.exp ?? 0) * 1000).toISOString(),
    user: {
      id: token.sub,
      name: token.name,
      email: token.email,
      image: token.picture,
      role: typeof token.role === "string" ? token.role : "USER",
      onboardingCompletedAt: token.onboardingCompletedAt as string | Date | null,
      pwChangedAt: typeof token.pwAt === "number" ? token.pwAt : null,
    },
  };
}

export async function getSession(request: Request = getRequest()): Promise<Session | null> {
  const authSecret = runtimeEnv.AUTH_SECRET ?? runtimeEnv.NEXTAUTH_SECRET;
  const secureCookies = (runtimeEnv.APP_URL ?? runtimeEnv.NEXTAUTH_URL ?? request.url).startsWith(
    "https:",
  );
  const sessionCookieName = `${secureCookies ? "__Secure-" : ""}next-auth.session-token`;
  if (!authSecret) return null;
  const token = await getToken({
    req: request,
    secret: authSecret,
    cookieName: sessionCookieName,
    decode: decodeSession,
  });
  return token?.sub ? sessionFromToken(token) : null;
}

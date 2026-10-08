import type { AuthConfig } from "@auth/core";
import type { JWT } from "@auth/core/jwt";
import { getToken } from "@auth/core/jwt";
import CredentialsProvider from "@auth/core/providers/credentials";
import DiscordProvider from "@auth/core/providers/discord";
import GitHubProvider from "@auth/core/providers/github";
import GoogleProvider from "@auth/core/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { getRequest } from "../server/request-context";
import { decodeSession, encodeSession } from "./auth-jwt";
import prisma from "./prisma";
import type { Session } from "./session";

const providers = [];

// A throwaway bcrypt hash used to equalize response time when a user/password
// row is missing, so the credentials login path is not a username-enumeration
// timing oracle (we always perform one bcrypt comparison).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("holoplax-timing-equalizer", 10);

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
      const user = await prisma.user.findUnique({
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
        ? await prisma.userPassword.findUnique({ where: { userId: user.id } })
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

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

if (process.env.GITHUB_ID && process.env.GITHUB_SECRET) {
  providers.push(
    GitHubProvider({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    }),
  );
}

if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
  providers.push(
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
    }),
  );
}

const secureCookies = (process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "").startsWith("https:");
export const sessionCookieName = `${secureCookies ? "__Secure-" : ""}next-auth.session-token`;
export const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

export const authOptions: AuthConfig = {
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
  adapter: PrismaAdapter(prisma),
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
        const record = await prisma.user.findUnique({
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
        const record = await prisma.user.findUnique({
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

        const existingUser = await prisma.user.findUnique({
          where: { email },
          select: { id: true, disabledAt: true, emailVerified: true },
        });

        if (existingUser?.disabledAt) return false;

        const linkedAccount = await prisma.account.findUnique({
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

          await prisma.account.create({
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
      const record = await prisma.user.findUnique({
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
  if (!authSecret) return null;
  const token = await getToken({
    req: request,
    secret: authSecret,
    cookieName: sessionCookieName,
    decode: decodeSession,
  });
  return token?.sub ? sessionFromToken(token) : null;
}

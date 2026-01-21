import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { compare } from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import DiscordProvider from "next-auth/providers/discord";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import prisma from "./prisma";

const providers = [];

providers.push(
  CredentialsProvider({
    name: "credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const email = credentials?.email?.toLowerCase().trim();
      const password = credentials?.password;
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
        },
      });
      if (!user) return null;
      if (user.disabledAt) return null;
      const passwordRow = await prisma.userPassword.findUnique({
        where: { userId: user.id },
      });
      if (!passwordRow) return null;
      if (!user.emailVerified) return null;
      const valid = await compare(password, passwordRow.hash);
      if (!valid) return null;
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role,
        disabledAt: user.disabledAt,
        onboardingCompletedAt: user.onboardingCompletedAt,
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

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers,
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  session: { strategy: "jwt" },
  callbacks: {
    jwt: async ({ token, user, trigger, session }) => {
      if (user) {
        token.sub = (user as { id?: string }).id ?? token.sub;
        token.role = (user as { role?: string }).role ?? "USER";
        token.name = user.name ?? token.name;
        token.email = user.email ?? token.email;
        token.picture = user.image ?? token.picture;
        token.disabledAt = (user as { disabledAt?: Date | null }).disabledAt ?? null;
        token.onboardingCompletedAt =
          (user as { onboardingCompletedAt?: Date | null }).onboardingCompletedAt ?? null;
      }
      if (trigger === "update") {
        const nextUser = session?.user as
          | {
              name?: string | null;
              email?: string | null;
              image?: string | null;
              onboardingCompletedAt?: string | null;
            }
          | undefined;
        if (nextUser) {
          token.name = nextUser.name ?? token.name;
          token.email = nextUser.email ?? token.email;
          token.picture = nextUser.image ?? token.picture;
          if (nextUser.onboardingCompletedAt) {
            token.onboardingCompletedAt = nextUser.onboardingCompletedAt;
          }
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
          select: { id: true, disabledAt: true },
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

          const canLink =
            (account.provider === "google" &&
              (profile as { email_verified?: boolean })?.email_verified === true) ||
            account.provider === "github";

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
      },
    }),
  },
};

import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import { compare } from "bcryptjs";
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
      const user = await prisma.user.findUnique({ where: { email } });
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

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers,
  pages: {
    signIn: "/auth/signin",
  },
  session: { strategy: "jwt" },
  callbacks: {
    jwt: ({ token, user, trigger, session }) => {
      if (user) {
        token.sub = (user as { id?: string }).id ?? token.sub;
        token.role = (user as { role?: string }).role ?? "USER";
        token.name = user.name ?? token.name;
        token.email = user.email ?? token.email;
        token.picture = user.image ?? token.picture;
        token.disabledAt = (user as { disabledAt?: Date | null }).disabledAt ?? null;
      }
      if (trigger === "update") {
        const nextUser = session?.user as
          | { name?: string | null; email?: string | null; image?: string | null }
          | undefined;
        if (nextUser) {
          token.name = nextUser.name ?? token.name;
          token.email = nextUser.email ?? token.email;
          token.picture = nextUser.image ?? token.picture;
        }
      }
      return token;
    },
    signIn: async ({ user }) => {
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
      },
    }),
  },
};

import type { Adapter, AdapterUser } from "@auth/core/adapters";
import type { User } from "../database/models";
import db from "./db";

const adapterUser = (user: User): AdapterUser => {
  if (!user.email) throw new Error("OAuth users require an email address");
  return { ...user, email: user.email };
};
export const d1AuthAdapter: Adapter = {
  async createUser(input) {
    return adapterUser(await db.user.create({ data: input }));
  },
  async getUser(id) {
    const user = await db.user.findUnique({ where: { id } });
    return user ? adapterUser(user) : null;
  },
  async getUserByEmail(email) {
    const user = await db.user.findUnique({ where: { email } });
    return user ? adapterUser(user) : null;
  },
  async getUserByAccount({ provider, providerAccountId }) {
    const account = await db.account.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId } },
      include: { user: true },
    });
    return account ? adapterUser(account.user) : null;
  },
  async updateUser(input) {
    return adapterUser(await db.user.update({ where: { id: input.id }, data: input }));
  },
  async deleteUser(id) {
    await db.user.delete({ where: { id } });
  },
  async linkAccount(account) {
    await db.account.create({
      data: {
        userId: account.userId,
        type: account.type,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        refresh_token: account.refresh_token,
        access_token: account.access_token,
        expires_at: account.expires_at,
        token_type: account.token_type,
        scope: account.scope,
        id_token: account.id_token,
        session_state: typeof account.session_state === "string" ? account.session_state : null,
      },
    });
  },
  async unlinkAccount({ provider, providerAccountId }) {
    await db.account.delete({
      where: { provider_providerAccountId: { provider, providerAccountId } },
    });
  },
  async createSession(input) {
    return db.session.create({ data: input });
  },
  async getSessionAndUser(sessionToken) {
    const session = await db.session.findUnique({
      where: { sessionToken },
      include: { user: true },
    });
    if (!session) return null;
    const { user, ...record } = session;
    return { session: record, user: adapterUser(user) };
  },
  async updateSession(input) {
    return db.session.update({ where: { sessionToken: input.sessionToken }, data: input });
  },
  async deleteSession(sessionToken) {
    await db.session.delete({ where: { sessionToken } });
  },
  async createVerificationToken(input) {
    return db.verificationToken.create({ data: input });
  },
  async useVerificationToken({ identifier, token }) {
    return db.command(async (tx) => {
      const record = await tx.verificationToken.findUnique({
        where: { identifier_token: { identifier, token } },
      });
      if (record)
        await tx.verificationToken.delete({ where: { identifier_token: { identifier, token } } });
      return record;
    });
  },
};

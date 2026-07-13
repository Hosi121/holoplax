import { randomBytes } from "crypto";
import { getBaseUrl } from "./base-url";
import { sendEmail } from "./mailer";
import prisma from "./prisma";

export const isSafeCallbackUrl = (value: string | null | undefined): value is string =>
  Boolean(value?.startsWith("/") && !value.startsWith("//"));

export async function sendVerificationEmail(params: {
  userId: string;
  email: string;
  callbackUrl?: string;
}): Promise<void> {
  const token = randomBytes(32).toString("hex");
  await prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.deleteMany({ where: { userId: params.userId } });
    await tx.emailVerificationToken.create({
      data: {
        userId: params.userId,
        token,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      },
    });
  });

  const verifyUrl = new URL("/auth/verify", getBaseUrl());
  verifyUrl.searchParams.set("token", token);
  if (isSafeCallbackUrl(params.callbackUrl)) {
    verifyUrl.searchParams.set("callbackUrl", params.callbackUrl);
  }
  const url = verifyUrl.toString();
  await sendEmail({
    to: params.email,
    subject: "Holoplax メール認証",
    html: `<p>以下のリンクからメール認証を完了してください。</p><p><a href="${url}">${url}</a></p>`,
  });
}

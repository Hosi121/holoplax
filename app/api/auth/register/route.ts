import { randomBytes } from "crypto";
import { hash } from "bcryptjs";
import { badRequest, conflict, ok, serverError } from "../../../../lib/api-response";
import { sendEmail } from "../../../../lib/mailer";
import prisma from "../../../../lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email ?? "").toLowerCase().trim();
    const password = String(body.password ?? "");
    const name = String(body.name ?? "").trim();

    if (!email || !password) {
      return badRequest("email and password are required");
    }
    if (password.length < 8) {
      return badRequest("password must be at least 8 characters");
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return conflict("email already registered");
    }

    const hashed = await hash(password, 10);
    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const isLocal = baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1");
    // ローカル（localhost）ではメール認証を自動スキップ。強制したい場合は EMAIL_VERIFY_ALWAYS=true を設定。
    const forceVerify = process.env.EMAIL_VERIFY_ALWAYS === "true";
    const hasEmailConfig = Boolean(process.env.EMAIL_SERVER && process.env.EMAIL_FROM);
    const shouldVerify = forceVerify || (!isLocal && hasEmailConfig);
    const user = await prisma.user.create({
      data: {
        email,
        name: name || null,
        emailVerified: shouldVerify ? null : new Date(),
        password: {
          create: { hash: hashed },
        },
      },
    });

    if (shouldVerify) {
      try {
        const token = randomBytes(32).toString("hex");
        await prisma.emailVerificationToken.create({
          data: {
            userId: user.id,
            token,
            expiresAt: new Date(Date.now() + 1000 * 60 * 60),
          },
        });
        const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
        const verifyUrl = `${baseUrl}/auth/verify?token=${token}`;
        await sendEmail({
          to: user.email ?? email,
          subject: "Holoplax メール認証",
          html: `<p>以下のリンクからメール認証を完了してください。</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
        });
      } catch (mailError) {
        console.error("Email verification send failed", mailError);
      }
    }

    return ok({ id: user.id, email: user.email });
  } catch (error) {
    console.error("POST /api/auth/register error", error);
    return serverError("failed to register");
  }
}

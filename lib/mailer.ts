import { getRuntime, runtimeEnv } from "../server/runtime";
export async function sendEmail(params: { to: string; subject: string; html: string }) {
  const from = runtimeEnv.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM is not configured");
  await getRuntime().env.EMAIL.send({
    from: { email: from, name: "Holoplax" },
    ...params,
    text: params.html
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  });
}

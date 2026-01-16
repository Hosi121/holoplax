import nodemailer from "nodemailer";

const getTransport = () => {
  const server = process.env.EMAIL_SERVER;
  if (!server) {
    throw new Error("EMAIL_SERVER is not configured");
  }
  return nodemailer.createTransport(server);
};

export async function sendEmail(params: { to: string; subject: string; html: string }) {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error("EMAIL_FROM is not configured");
  }
  const transport = getTransport();
  await transport.sendMail({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
}

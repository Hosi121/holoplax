import nodemailer from "nodemailer";

/**
 * Module-level singleton transport.
 *
 * nodemailer.createTransport() does not open a connection immediately, but
 * calling it on every sendEmail() means each email creates a new Transporter
 * instance.  With pooled transports (pool: true) each instance owns its own
 * pool, so reusing one instance is important for two reasons:
 *
 * 1. **Connection reuse** — avoids the TCP + TLS handshake overhead for every
 *    email when the SMTP server supports persistent connections.
 * 2. **SMTP server pressure** — prevents accumulating many short-lived
 *    connections that can trigger rate limits or max-connection errors on the
 *    remote server.
 *
 * The instance is replaced if EMAIL_SERVER changes between calls (unlikely in
 * production but useful in tests that mutate env vars).
 */
let _transport: ReturnType<typeof nodemailer.createTransport> | null = null;
let _lastServer: string | undefined;

const getTransport = (): ReturnType<typeof nodemailer.createTransport> => {
  const server = process.env.EMAIL_SERVER;
  if (!server) {
    throw new Error("EMAIL_SERVER is not configured");
  }
  // Replace the cached instance if the connection string changed (e.g. in tests).
  if (!_transport || server !== _lastServer) {
    _transport = nodemailer.createTransport(server);
    _lastServer = server;
  }
  return _transport;
};

export async function sendEmail(params: { to: string; subject: string; html: string }) {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error("EMAIL_FROM is not configured");
  }
  await getTransport().sendMail({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
}

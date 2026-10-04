/** Where studio mail goes (plan §4.5): the webhook t-shoot already had, or SMTP (Resend, Postmark, Gmail all speak it). */

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Extra headers, e.g. List-Unsubscribe. */
  headers?: Record<string, string>;
};

export interface MailTransport {
  readonly name: "smtp" | "webhook";
  send(mail: Mail): Promise<void>;
}

export type SmtpConfig = { host: string; port: number; user?: string; pass?: string; from: string; secure: boolean };

/** SMTP_* from the environment, or null when SMTP isn't set up. */
export function smtpConfig(env: NodeJS.ProcessEnv = process.env): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  if (!host) return null;
  const port = Number(env.SMTP_PORT?.trim() || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`SMTP_PORT=${env.SMTP_PORT} is not a port number.`);
  const from = env.SMTP_FROM?.trim();
  if (!from) throw new Error('SMTP_HOST is set but SMTP_FROM is not. Set it like: SMTP_FROM="Your Studio <studio@example.com>"');
  return { host, port, user: env.SMTP_USER?.trim() || undefined, pass: env.SMTP_PASS || undefined, from, secure: port === 465 };
}

/** Which transport production uses: SMTP if configured, else the webhook, else none. Pure, so it can be tested. */
export function pickTransportName(env: NodeJS.ProcessEnv = process.env): "smtp" | "webhook" | null {
  if (env.SMTP_HOST?.trim()) return "smtp";
  if (env.MAIL_WEBHOOK_URL?.trim()) return "webhook";
  return null;
}

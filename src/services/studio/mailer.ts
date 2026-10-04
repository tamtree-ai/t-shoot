/** Sends studio mail (plan §4.5). Always recorded in `mail_outbox`; only a production server actually sends. */
import "server-only";

import { eq, inArray, and } from "drizzle-orm";

import { db, schema } from "@/db";
import { smtpConfig, type Mail, type MailTransport, pickTransportName } from "@/lib/mail/transport";
import { smtpTransport } from "@/lib/mail/smtp";
import { webhookTransport } from "@/lib/mail/webhook";
import { studioEnv } from "@/lib/studio/env";

let transport: MailTransport | null | undefined;
let warned = false;

function pick(): MailTransport | null {
  if (transport !== undefined) return transport;
  const name = pickTransportName();
  transport = name === "smtp" ? smtpTransport(smtpConfig()!) : name === "webhook" ? webhookTransport(process.env.MAIL_WEBHOOK_URL!.trim()) : null;
  return transport;
}

/** For tests: forget the chosen transport. */
export function resetMailer(): void {
  transport = undefined;
  warned = false;
}

export async function sendStudioMail(mail: Mail, opts: { production?: boolean } = {}): Promise<void> {
  await db.insert(schema.mailOutbox).values({ toEmail: mail.to, subject: mail.subject, body: mail.text });
  if (!(opts.production ?? process.env.NODE_ENV === "production")) return;
  const t = pick();
  if (!t) {
    if (!warned) console.error("[studio mail] No SMTP_HOST or MAIL_WEBHOOK_URL is set, so studio email is only saved in mail_outbox.");
    warned = true;
    return;
  }
  await t.send(mail);
}

/** The people who hear about a share's activity: owners and editors who haven't switched that kind off in their notification settings. */
export async function studioRecipients(orgId: string, kind: "comment" | "decision"): Promise<string[]> {
  const rows = await db.select().from(schema.members).where(and(eq(schema.members.orgId, orgId), inArray(schema.members.role, ["owner", "editor"])));
  return rows.filter((m) => (kind === "comment" ? m.notifyComment : m.notifyApproved)).map((m) => m.email);
}

/** Absolute link: APP_URL when set, else a path the outbox can still show. */
export function absoluteUrl(path: string): string {
  return `${studioEnv().appUrl ?? ""}${path}`;
}

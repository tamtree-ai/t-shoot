import nodemailer from "nodemailer";

import type { Mail, MailTransport, SmtpConfig } from "./transport";

export function smtpTransport(cfg: SmtpConfig): MailTransport {
  const t = nodemailer.createTransport({ host: cfg.host, port: cfg.port, secure: cfg.secure, auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined });
  return {
    name: "smtp",
    async send(mail: Mail) {
      await t.sendMail({ from: cfg.from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html, headers: mail.headers });
    },
  };
}

import type { Mail, MailTransport } from "./transport";

/** POSTs `{to, subject, text, html, headers}` as JSON, the shape MAIL_WEBHOOK_URL already received (html and headers are new, and ignorable). */
export function webhookTransport(url: string, fetchImpl: typeof fetch = fetch): MailTransport {
  return {
    name: "webhook",
    async send(mail: Mail) {
      const res = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(mail) });
      if (!res.ok) throw new Error(`The mail webhook answered ${res.status}.`);
    },
  };
}

import { describe, expect, it, vi } from "vitest";

import { esc, renderMail, type MailBrand } from "./templates/layout";
import { decisionMail, newVersionMail, ownerDigest, replyToReviewer } from "./templates/studio";
import { pickTransportName, smtpConfig } from "./transport";
import { webhookTransport } from "./webhook";

const env = (v: Record<string, string>) => v as unknown as NodeJS.ProcessEnv;

const brand: MailBrand = { studioName: "Dilhan Studio", accentHex: "#ff6a3d", logoUrl: "https://studio.example.com/review/tok/logo", footer: "Colombo\nhello@dilhan.studio", website: null };

describe("transport choice", () => {
  it("prefers SMTP, then the webhook, else nothing", () => {
    expect(pickTransportName(env({ SMTP_HOST: "smtp.example.com", MAIL_WEBHOOK_URL: "http://x" }))).toBe("smtp");
    expect(pickTransportName(env({ MAIL_WEBHOOK_URL: "http://x" }))).toBe("webhook");
    expect(pickTransportName(env({}))).toBeNull();
    expect(pickTransportName(env({ SMTP_HOST: "  " }))).toBeNull();
  });

  it("reads SMTP settings, with 587 as the default and TLS on 465", () => {
    expect(smtpConfig(env({ SMTP_HOST: "h", SMTP_FROM: "A <a@x.co>" }))).toEqual({ host: "h", port: 587, user: undefined, pass: undefined, from: "A <a@x.co>", secure: false });
    expect(smtpConfig(env({ SMTP_HOST: "h", SMTP_PORT: "465", SMTP_FROM: "a@x.co", SMTP_USER: "u", SMTP_PASS: "p" }))).toMatchObject({ port: 465, secure: true, user: "u", pass: "p" });
    expect(smtpConfig(env({}))).toBeNull();
  });

  it("refuses a half-set SMTP config with a message that says what to add", () => {
    expect(() => smtpConfig(env({ SMTP_HOST: "h" }))).toThrow(/SMTP_FROM/);
    expect(() => smtpConfig(env({ SMTP_HOST: "h", SMTP_FROM: "a@x.co", SMTP_PORT: "abc" }))).toThrow(/SMTP_PORT/);
  });

  it("posts the mail to the webhook as JSON, and fails loudly when the webhook does", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    await webhookTransport("http://hook", fetchImpl as unknown as typeof fetch).send({ to: "a@x.co", subject: "S", text: "T", html: "<p>T</p>" });
    expect(fetchImpl).toHaveBeenCalledWith("http://hook", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, { body: string }])[1].body)).toMatchObject({ to: "a@x.co", subject: "S", html: "<p>T</p>" });
    const bad = vi.fn(async () => new Response("no", { status: 500 }));
    await expect(webhookTransport("http://hook", bad as unknown as typeof fetch).send({ to: "a", subject: "s", text: "t" })).rejects.toThrow(/500/);
  });
});

describe("email layout", () => {
  it("escapes everything a client typed", () => {
    expect(esc(`<script>alert("x")</script> & 'y'`)).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;");
    const { html } = renderMail(brand, "pre", [{ kind: "quote", who: `<b>Sam</b>`, text: `<img src=x onerror=alert(1)>` }]);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<b>Sam</b>");
  });

  it("carries the brand: name, accent, logo, footer, and a readable button", () => {
    const { html, text } = renderMail(brand, "pre", [{ kind: "button", label: "Open", href: "https://x.co/a?b=1&c=2" }], "https://x.co/unsub");
    expect(html).toContain("Dilhan Studio");
    expect(html).toContain("#ff6a3d");
    expect(html).toContain('src="https://studio.example.com/review/tok/logo"');
    expect(html).toContain("Colombo<br>hello@dilhan.studio");
    expect(html).toContain("https://x.co/a?b=1&amp;c=2");
    expect(html).toContain("Stop these emails");
    expect(text).toContain("Open: https://x.co/a?b=1&c=2");
    expect(text).toContain("Stop these emails: https://x.co/unsub");
  });

  it("falls back to a square in the accent when there is no logo, and to the default accent for junk", () => {
    const { html } = renderMail({ ...brand, logoUrl: null, accentHex: "nope" }, "p", [{ kind: "p", text: "hi" }]);
    expect(html).not.toContain("<img");
    expect(html).toContain("#1f6feb");
  });

  it("has a plain-text twin with no markup", () => {
    const { text } = renderMail(brand, "pre", [{ kind: "h", text: "Hello" }, { kind: "p", text: "Line one\nLine two" }]);
    expect(text).not.toMatch(/<[a-z]/);
    expect(text).toContain("Line one\nLine two");
  });
});

describe("the emails", () => {
  it("digests comments and replies, counting each", () => {
    const m = ownerDigest(brand, { shareTitle: "Spring", projectName: "Acme", link: "https://x.co/o", items: [{ who: "Sam", where: "Banner · Main v2", excerpt: "Logo bigger", kind: "comment" }, { who: "Sam", where: "Banner · Main v2", excerpt: "Yes that one", kind: "reply" }, { who: "Kim", where: "Banner · Main v2", excerpt: "Agree", kind: "comment" }] });
    expect(m.subject).toBe("2 new comments and 1 reply on Spring");
    expect(m.html).toContain("Logo bigger");
    expect(m.text).toContain("https://x.co/o");
  });

  it("says singular and caps a long digest", () => {
    expect(ownerDigest(brand, { shareTitle: "S", projectName: "P", link: "l", items: [{ who: "A", where: "w", excerpt: "e", kind: "comment" }] }).subject).toBe("1 new comment on S");
    const many = Array.from({ length: 12 }, (_, i) => ({ who: "A", where: "w", excerpt: `c${i}`, kind: "comment" as const }));
    const m = ownerDigest(brand, { shareTitle: "S", projectName: "P", link: "l", items: many });
    expect(m.html).toContain("and 4 more");
    expect(m.html).not.toContain("c11");
  });

  it("clips a very long comment", () => {
    const m = ownerDigest(brand, { shareTitle: "S", projectName: "P", link: "l", items: [{ who: "A", where: "w", excerpt: "x".repeat(2000), kind: "comment" }] });
    expect(m.html.length).toBeLessThan(6000);
    expect(m.html).toContain("…");
  });

  it("tells the studio about an approval, and about a change request with its note and round", () => {
    const ok = decisionMail(brand, { decision: "approved", who: "Sam", where: "Banner · Main v2", note: null, openComments: 0, roundLabel: "Round 2 of 3", link: "l" });
    expect(ok.subject).toBe("Approved: Banner · Main v2");
    expect(ok.text).toContain("Sam approved Banner · Main v2");
    const ch = decisionMail(brand, { decision: "changes_requested", who: "Sam", where: "Banner · Main v2", note: "Please fix the logo", openComments: 3, roundLabel: "Round 2 of 3", link: "l" });
    expect(ch.subject).toBe("Changes requested: Banner · Main v2");
    expect(ch.text).toContain("Please fix the logo");
    expect(ch.text).toContain("3 open comments to work through");
    expect(decisionMail(brand, { decision: "changes_requested", who: "S", where: "w", note: null, openComments: 1, roundLabel: null, link: "l" }).text).toContain("1 open comment to work through");
  });

  it("tells a reviewer about a reply, with a way to stop", () => {
    const m = replyToReviewer(brand, { reviewerName: "Sam", replies: [{ where: "Banner · Main v2", excerpt: "Done, see v3" }], shareTitle: "Spring", link: "https://x.co/r", unsubscribeUrl: "https://x.co/u" });
    expect(m.subject).toContain("Dilhan Studio replied to your comment");
    expect(m.html).toContain("Hi Sam,");
    expect(m.html).toContain("https://x.co/u");
  });

  it("tells a reviewer about new versions, with what changed", () => {
    const one = newVersionMail(brand, { reviewerName: "Sam", versions: [{ where: "Banner · Main v3", note: "Logo larger" }], shareTitle: "Spring", link: "l", unsubscribeUrl: "u" });
    expect(one.subject).toBe("A new version is ready: Banner · Main v3 · Spring");
    expect(one.text).toContain("What changed: Logo larger");
    const two = newVersionMail(brand, { reviewerName: "Sam", versions: [{ where: "a", note: "" }, { where: "b", note: "" }], shareTitle: "Spring", link: "l", unsubscribeUrl: "u" });
    expect(two.subject).toBe("2 new versions are ready · Spring");
    expect(two.text).toContain("No note on this version.");
  });
});

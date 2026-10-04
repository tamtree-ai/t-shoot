/**
 * The shell of every studio email: the studio's logo, name and accent, a plain-text twin, and the
 * footer. Table layout with inline styles, because mail clients ignore everything else.
 */
import { inkOn, normaliseHex } from "@/lib/studio/color";

export type MailBrand = { studioName: string; accentHex: string; logoUrl: string | null; footer: string; website: string | null };

export const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export type Block = { kind: "p"; text: string } | { kind: "quote"; who: string; text: string } | { kind: "h"; text: string } | { kind: "button"; label: string; href: string } | { kind: "small"; text: string };

export function renderMail(brand: MailBrand, preheader: string, blocks: Block[], unsubscribeUrl?: string): { html: string; text: string } {
  const accent = normaliseHex(brand.accentHex) ?? "#1f6feb";
  const ink = inkOn(accent);
  const body = blocks
    .map((b) => {
      switch (b.kind) {
        case "h":
          return `<h1 style="margin:0 0 12px;font:400 26px/1.15 Georgia,'Times New Roman',serif;color:#18181b">${esc(b.text)}</h1>`;
        case "p":
          return `<p style="margin:0 0 14px;font:15px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#3f3f46">${esc(b.text).replace(/\n/g, "<br>")}</p>`;
        case "quote":
          return `<div style="margin:0 0 14px;padding:10px 14px;border-left:3px solid ${accent};background:#f6f5f2;font:14px/1.55 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#18181b"><div style="font-weight:600;margin-bottom:2px">${esc(b.who)}</div>${esc(b.text).replace(/\n/g, "<br>")}</div>`;
        case "button":
          return `<p style="margin:6px 0 18px"><a href="${esc(b.href)}" style="display:inline-block;padding:11px 20px;border-radius:10px;background:${accent};color:${ink};font:600 14px -apple-system,Segoe UI,Helvetica,Arial,sans-serif;text-decoration:none">${esc(b.label)}</a></p>`;
        case "small":
          return `<p style="margin:0 0 10px;font:12.5px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#6b6b73">${esc(b.text)}</p>`;
      }
    })
    .join("\n");

  const logo = brand.logoUrl ? `<img src="${esc(brand.logoUrl)}" alt="" height="28" style="height:28px;max-width:140px;vertical-align:middle;margin-right:10px">` : `<span style="display:inline-block;width:24px;height:24px;border-radius:6px;background:${accent};vertical-align:middle;margin-right:10px"></span>`;
  const footerHtml = [brand.footer.trim() && esc(brand.footer.trim()).replace(/\n/g, "<br>"), unsubscribeUrl && `<a href="${esc(unsubscribeUrl)}" style="color:#6b6b73">Stop these emails</a>`].filter(Boolean).join("<br><br>");

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(brand.studioName)}</title></head>
<body style="margin:0;padding:0;background:#f6f5f2">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e4e2dd;border-radius:14px"><tr><td style="padding:26px 28px">
<p style="margin:0 0 22px;font:600 15px -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#18181b">${logo}${esc(brand.studioName)}</p>
${body}
</td></tr></table>
<p style="max-width:560px;margin:14px auto 0;font:12px/1.55 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#6b6b73;text-align:left">${footerHtml}</p>
</td></tr></table></body></html>`;

  const text = [
    ...blocks.map((b) => (b.kind === "button" ? `${b.label}: ${b.href}` : b.kind === "quote" ? `${b.who}: ${b.text}` : b.text)),
    "",
    brand.studioName,
    brand.footer.trim(),
    unsubscribeUrl ? `Stop these emails: ${unsubscribeUrl}` : "",
  ]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n")
    .trim();
  return { html, text };
}

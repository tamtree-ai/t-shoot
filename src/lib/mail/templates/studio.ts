/** The emails (plan §4.5). Each returns subject, html and text; none touches the database. */
import { type Block, type MailBrand, renderMail } from "./layout";

export type MailContent = { subject: string; html: string; text: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const clip = (s: string, n = 280) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export type DigestItem = { who: string; where: string; excerpt: string; kind: "comment" | "reply" };

/** To the studio: what a client wrote on one share since the last email. */
export function ownerDigest(brand: MailBrand, o: { shareTitle: string; projectName: string; items: DigestItem[]; link: string }): MailContent {
  const comments = o.items.filter((i) => i.kind === "comment").length;
  const replies = o.items.length - comments;
  const parts = [comments > 0 && plural(comments, "new comment"), replies > 0 && plural(replies, "reply", "replies")].filter(Boolean).join(" and ");
  const shown = o.items.slice(0, 8);
  const blocks: Block[] = [
    { kind: "h", text: parts },
    { kind: "p", text: `On “${o.shareTitle}” (${o.projectName}).` },
    ...shown.map<Block>((i) => ({ kind: "quote", who: `${i.who} · ${i.where}`, text: clip(i.excerpt) })),
    ...(o.items.length > shown.length ? [{ kind: "small", text: `…and ${o.items.length - shown.length} more.` } as Block] : []),
    { kind: "button", label: "Open the comments", href: o.link },
  ];
  const { html, text } = renderMail(brand, parts, blocks);
  return { subject: `${parts} on ${o.shareTitle}`, html, text };
}

/** To the studio, at once: a client approved, or asked for changes. */
export function decisionMail(brand: MailBrand, o: { decision: "approved" | "changes_requested"; who: string; where: string; note: string | null; openComments: number; roundLabel: string | null; link: string }): MailContent {
  const approved = o.decision === "approved";
  const headline = approved ? `${o.who} approved ${o.where}` : `${o.who} asked for changes to ${o.where}`;
  const blocks: Block[] = [
    { kind: "h", text: approved ? "Approved" : "Changes requested" },
    { kind: "p", text: headline + "." },
    ...(o.note ? [{ kind: "quote", who: o.who, text: o.note } as Block] : []),
    ...(!approved ? [{ kind: "p", text: o.openComments > 0 ? `${plural(o.openComments, "open comment")} to work through.` : "They didn't leave any open comments." } as Block] : []),
    ...(o.roundLabel ? [{ kind: "small", text: o.roundLabel } as Block] : []),
    { kind: "button", label: approved ? "See the sign-off" : "Open the comments", href: o.link },
  ];
  const { html, text } = renderMail(brand, headline, blocks);
  return { subject: approved ? `Approved: ${o.where}` : `Changes requested: ${o.where}`, html, text };
}

/** To a reviewer: the studio replied in a thread they are in. */
export function replyToReviewer(brand: MailBrand, o: { reviewerName: string; replies: { where: string; excerpt: string }[]; shareTitle: string; link: string; unsubscribeUrl: string }): MailContent {
  const headline = `${brand.studioName} replied to your ${o.replies.length === 1 ? "comment" : "comments"}`;
  const blocks: Block[] = [
    { kind: "p", text: `Hi ${o.reviewerName},` },
    { kind: "h", text: headline },
    ...o.replies.slice(0, 6).map<Block>((r) => ({ kind: "quote", who: `${brand.studioName} · ${r.where}`, text: clip(r.excerpt) })),
    { kind: "button", label: "Open the review", href: o.link },
  ];
  const { html, text } = renderMail(brand, headline, blocks, o.unsubscribeUrl);
  return { subject: `${headline} · ${o.shareTitle}`, html, text };
}

/** To a reviewer: a new version is up on a share they follow. */
export function newVersionMail(brand: MailBrand, o: { reviewerName: string; versions: { where: string; note: string }[]; shareTitle: string; link: string; unsubscribeUrl: string }): MailContent {
  const headline = o.versions.length === 1 ? `A new version is ready: ${o.versions[0]!.where}` : `${o.versions.length} new versions are ready`;
  const blocks: Block[] = [
    { kind: "p", text: `Hi ${o.reviewerName},` },
    { kind: "h", text: headline },
    ...o.versions.slice(0, 6).map<Block>((v) => ({ kind: "quote", who: v.where, text: v.note ? `What changed: ${clip(v.note)}` : "No note on this version." })),
    { kind: "button", label: "Review it", href: o.link },
  ];
  const { html, text } = renderMail(brand, headline, blocks, o.unsubscribeUrl);
  return { subject: `${headline} · ${o.shareTitle}`, html, text };
}

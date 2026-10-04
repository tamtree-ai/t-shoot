/**
 * Email notifications (plan §4.5), built on `studio_events`.
 *
 *   studio  ← a client's comments and replies: one digest per share, 5 minutes after the last one
 *   studio  ← a decision (approved / changes requested): at once
 *   client  ← the studio replied in their thread: one mail per person, 2 minutes after the last reply
 *   client  ← a new version on a share they follow: 10 minutes after the upload, once it is processed
 *
 * Events are claimed (notified_at set) before mailing, so two sweeps never send twice; a send that
 * fails gives its claim back and the job retries.
 */
import "server-only";

import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import { db, schema } from "@/db";
import { enqueueStudioNotify } from "@/lib/queue";
import { decrypt } from "@/lib/studio/crypto";
import type { MailBrand } from "@/lib/mail/templates/layout";
import { decisionMail, newVersionMail, ownerDigest, replyToReviewer, type DigestItem, type MailContent } from "@/lib/mail/templates/studio";

import { unsubscribeToken } from "./access";
import { getBrand } from "./brand";
import { absoluteUrl, sendStudioMail, studioRecipients } from "./mailer";
import { getProject, projectRounds } from "./projects";
import { shareState } from "./shares";

type EventRow = typeof schema.studioEvents.$inferSelect;

export const QUIET = { ownerDigest: 5 * 60_000, studioReply: 2 * 60_000, newVersion: 10 * 60_000 };
/** Even with comments still coming in, a digest goes out once its oldest item is this old. */
export const MAX_WAIT = 30 * 60_000;
const LOOKBACK_MS = 14 * 86_400_000;

/** Decisions go out at once; comments wait for the digest sweep. */
export async function notifyOwnerSoon(shareId: string, opts: { immediate?: boolean } = {}): Promise<void> {
  if (!opts.immediate) return;
  try {
    await enqueueStudioNotify(shareId);
  } catch (e) {
    // A queue hiccup must not fail a client's approval. The next sweep still finds the event.
    console.error("[studio notify]", e);
  }
}

/** Has the group been quiet long enough (or waited too long) to send? */
export function digestDue(events: Pick<EventRow, "createdAt">[], quietMs: number, now: number, maxWaitMs = MAX_WAIT): boolean {
  if (events.length === 0) return false;
  const times = events.map((e) => e.createdAt.getTime());
  return now - Math.max(...times) >= quietMs || now - Math.min(...times) >= maxWaitMs;
}

function groupBy<T, K>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const i of items) m.set(key(i), [...(m.get(key(i)) ?? []), i]);
  return m;
}

/** Marks events as handled and returns the ones this caller won. */
async function claim(events: EventRow[]): Promise<EventRow[]> {
  if (events.length === 0) return [];
  const won = await db
    .update(schema.studioEvents)
    .set({ notifiedAt: new Date() })
    .where(and(inArray(schema.studioEvents.id, events.map((e) => e.id)), isNull(schema.studioEvents.notifiedAt)))
    .returning({ id: schema.studioEvents.id });
  const ids = new Set(won.map((w) => w.id));
  return events.filter((e) => ids.has(e.id));
}

async function release(events: EventRow[]): Promise<void> {
  if (events.length === 0) return;
  await db.update(schema.studioEvents).set({ notifiedAt: null }).where(inArray(schema.studioEvents.id, events.map((e) => e.id)));
}

async function mailBrand(orgId: string, token: string | null): Promise<MailBrand> {
  const b = await getBrand(orgId);
  return { studioName: b.studioName, accentHex: b.accentHex, footer: b.emailFooter, website: b.website, logoUrl: token && b.logoFileId && absoluteUrl("") ? absoluteUrl(`/review/${token}/logo`) : null };
}

/** Where a version lives, for links and titles. */
async function versionInfo(versionIds: string[]) {
  const ids = [...new Set(versionIds.filter(Boolean))];
  if (ids.length === 0) return new Map<string, { assetId: string; variationId: string; where: string; changeNote: string; processing: string }>();
  const rows = await db
    .select({ id: schema.studioVersions.id, number: schema.studioVersions.number, note: schema.studioVersions.changeNote, variationId: schema.studioVariations.id, label: schema.studioVariations.label, assetId: schema.studioAssets.id, title: schema.studioAssets.title, processing: schema.studioFiles.processing })
    .from(schema.studioVersions)
    .innerJoin(schema.studioVariations, eq(schema.studioVariations.id, schema.studioVersions.variationId))
    .innerJoin(schema.studioAssets, eq(schema.studioAssets.id, schema.studioVariations.assetId))
    .innerJoin(schema.studioFiles, eq(schema.studioFiles.id, schema.studioVersions.fileId))
    .where(inArray(schema.studioVersions.id, ids));
  return new Map(rows.map((r) => [r.id, { assetId: r.assetId, variationId: r.variationId, where: `${r.title} · ${r.label} v${r.number}`, changeNote: r.note, processing: r.processing }]));
}

const studioLink = (i: { assetId: string; variationId: string }, versionId: string) => absoluteUrl(`/studio/assets/${i.assetId}?option=${i.variationId}&v=${versionId}`);
const str = (v: unknown) => (typeof v === "string" ? v : "");

async function unnotified(types: string[], since: number, shareId?: string): Promise<EventRow[]> {
  return db
    .select()
    .from(schema.studioEvents)
    .where(and(inArray(schema.studioEvents.type, types), isNull(schema.studioEvents.notifiedAt), gte(schema.studioEvents.createdAt, new Date(since - LOOKBACK_MS)), shareId ? eq(schema.studioEvents.shareId, shareId) : undefined))
    .orderBy(schema.studioEvents.createdAt)
    .limit(2000);
}

/** Approvals and change requests, to the studio, right now. */
export async function sendDecisionMails(opts: { shareId?: string; olderThanMs?: number; now?: number } = {}): Promise<number> {
  const now = opts.now ?? Date.now();
  const events = (await unnotified(["decision.approved", "decision.changes_requested"], now, opts.shareId)).filter((e) => now - e.createdAt.getTime() >= (opts.olderThanMs ?? 0));
  let sent = 0;
  for (const e of await claim(events)) {
    try {
      const orgId = e.orgId;
      const info = (await versionInfo([str(e.payload.versionId)])).get(str(e.payload.versionId));
      const project = e.projectId ? await getProject(orgId, e.projectId) : null;
      const rounds = project ? await projectRounds(orgId, project) : null;
      const open = info ? await openRoots(str(e.payload.versionId)) : 0;
      const brand = await mailBrand(orgId, null);
      const approved = e.type === "decision.approved";
      const mail = decisionMail(brand, { decision: approved ? "approved" : "changes_requested", who: e.actorLabel, where: str(e.payload.where), note: typeof e.payload.note === "string" ? e.payload.note : null, openComments: open, roundLabel: rounds?.label ?? null, link: info ? studioLink(info, str(e.payload.versionId)) : absoluteUrl("/studio") });
      for (const to of await studioRecipients(orgId, "decision")) {
        await sendStudioMail({ to, ...mail });
        sent++;
      }
    } catch (err) {
      await release([e]);
      throw err;
    }
  }
  return sent;
}

async function openRoots(versionId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.studioComments)
    .where(and(eq(schema.studioComments.versionId, versionId), isNull(schema.studioComments.parentId), isNull(schema.studioComments.resolvedAt), isNull(schema.studioComments.deletedAt), eq(schema.studioComments.internal, false)));
  return Number(r?.n ?? 0);
}

/** A client's comments and replies, to the studio: one email per share. */
export async function sendOwnerDigests(now = Date.now()): Promise<number> {
  const events = (await unnotified(["comment.added", "comment.replied"], now)).filter((e) => e.payload.byStudio !== true && e.shareId);
  let sent = 0;
  for (const [shareId, group] of groupBy(events, (e) => e.shareId!)) {
    if (!digestDue(group, QUIET.ownerDigest, now)) continue;
    const won = await claim(group);
    if (won.length === 0) continue;
    try {
      const [share] = await db.select().from(schema.studioShares).where(eq(schema.studioShares.id, shareId)).limit(1);
      if (!share) continue;
      const project = await getProject(share.orgId, share.projectId);
      const infos = await versionInfo(won.map((e) => str(e.payload.versionId)));
      const first = won[0]!;
      const info = infos.get(str(first.payload.versionId));
      const items: DigestItem[] = won.map((e) => ({ who: e.actorLabel, where: str(e.payload.where), excerpt: str(e.payload.excerpt), kind: e.type === "comment.added" ? "comment" : "reply" }));
      const mail = ownerDigest(await mailBrand(share.orgId, null), { shareTitle: share.title, projectName: project?.name ?? "", items, link: info ? studioLink(info, str(first.payload.versionId)) : absoluteUrl(`/studio/shares/${shareId}`) });
      for (const to of await studioRecipients(share.orgId, "comment")) {
        await sendStudioMail({ to, ...mail });
        sent++;
      }
    } catch (err) {
      await release(won);
      throw err;
    }
  }
  return sent;
}

const liveShare = (s: typeof schema.studioShares.$inferSelect) => shareState(s) === "live";

/** The studio replied in a thread: tell the reviewers who are in it, once each. */
export async function sendReviewerReplyMails(now = Date.now()): Promise<number> {
  const events = (await unnotified(["comment.replied"], now)).filter((e) => e.payload.byStudio === true && e.shareId);
  let sent = 0;
  for (const [shareId, group] of groupBy(events, (e) => e.shareId!)) {
    if (!digestDue(group, QUIET.studioReply, now, 15 * 60_000)) continue;
    const won = await claim(group);
    if (won.length === 0) continue;
    try {
      const [share] = await db.select().from(schema.studioShares).where(eq(schema.studioShares.id, shareId)).limit(1);
      if (!share || !liveShare(share)) continue;
      const token = decrypt(share.tokenEnc);
      // Who wrote in each thread the studio answered.
      const parentIds = [...new Set(won.map((e) => str(e.payload.parentId)).filter(Boolean))];
      const thread = parentIds.length
        ? await db
            .select({ id: schema.studioComments.id, parentId: schema.studioComments.parentId, reviewerId: schema.studioComments.authorReviewerId })
            .from(schema.studioComments)
            .where(sql`${schema.studioComments.id} in (${sql.join(parentIds.map((p) => sql`${p}::uuid`), sql`, `)}) or ${schema.studioComments.parentId} in (${sql.join(parentIds.map((p) => sql`${p}::uuid`), sql`, `)})`)
        : [];
      const reviewers = await db.select().from(schema.studioReviewers).where(eq(schema.studioReviewers.shareId, shareId));
      const byReviewer = new Map<string, EventRow[]>();
      for (const e of won) {
        const root = str(e.payload.parentId);
        const people = new Set(thread.filter((t) => (t.id === root || t.parentId === root) && t.reviewerId).map((t) => t.reviewerId!));
        for (const id of people) byReviewer.set(id, [...(byReviewer.get(id) ?? []), e]);
      }
      const brand = await mailBrand(share.orgId, token);
      for (const [reviewerId, evs] of byReviewer) {
        const r = reviewers.find((x) => x.id === reviewerId);
        if (!r || !r.notify) continue;
        const last = evs[evs.length - 1]!;
        const mail = replyToReviewer(brand, {
          reviewerName: r.name,
          replies: evs.map((e) => ({ where: str(e.payload.where), excerpt: str(e.payload.excerpt) })),
          shareTitle: share.title,
          link: absoluteUrl(`/review/${token}?v=${str(last.payload.versionId)}&c=${str(last.payload.parentId)}`),
          unsubscribeUrl: absoluteUrl(`/review/unsubscribe/${unsubscribeToken(r.id)}`),
        });
        await sendStudioMail({ to: r.email, ...mail, headers: { "List-Unsubscribe": `<${absoluteUrl(`/review/unsubscribe/${unsubscribeToken(r.id)}`)}>` } });
        sent++;
      }
    } catch (err) {
      await release(won);
      throw err;
    }
  }
  return sent;
}

/** A new version, to reviewers on shares that show the latest. Waits for the file to be processed, and for the studio to stop uploading. */
export async function sendNewVersionMails(now = Date.now()): Promise<number> {
  const events = await unnotified(["version.uploaded"], now);
  if (events.length === 0) return 0;
  const infos = await versionInfo(events.map((e) => str(e.payload.versionId)));
  let sent = 0;
  for (const [projectId, group] of groupBy(events, (e) => e.projectId ?? "")) {
    if (!projectId || !digestDue(group, QUIET.newVersion, now, 60 * 60_000)) continue;
    // A file still processing: leave the whole group for the next sweep.
    if (group.some((e) => infos.get(str(e.payload.versionId))?.processing === "pending")) continue;
    const won = await claim(group);
    if (won.length === 0) continue;
    try {
      const shares = (await db.select().from(schema.studioShares).where(and(eq(schema.studioShares.projectId, projectId), eq(schema.studioShares.versionMode, "latest")))).filter(liveShare);
      const items = shares.length ? await db.select().from(schema.studioShareItems).where(inArray(schema.studioShareItems.shareId, shares.map((s) => s.id))) : [];
      for (const share of shares) {
        const mine = won.filter((e) => {
          const i = infos.get(str(e.payload.versionId));
          return i && i.processing === "ready" && items.some((it) => it.shareId === share.id && it.assetId === i.assetId);
        });
        if (mine.length === 0) continue;
        const token = decrypt(share.tokenEnc);
        const brand = await mailBrand(share.orgId, token);
        const reviewers = await db.select().from(schema.studioReviewers).where(and(eq(schema.studioReviewers.shareId, share.id), eq(schema.studioReviewers.notify, true)));
        const last = mine[mine.length - 1]!;
        for (const r of reviewers) {
          const mail = newVersionMail(brand, {
            reviewerName: r.name,
            versions: mine.map((e) => ({ where: infos.get(str(e.payload.versionId))!.where, note: infos.get(str(e.payload.versionId))!.changeNote })),
            shareTitle: share.title,
            link: absoluteUrl(`/review/${token}?v=${str(last.payload.versionId)}`),
            unsubscribeUrl: absoluteUrl(`/review/unsubscribe/${unsubscribeToken(r.id)}`),
          });
          await sendStudioMail({ to: r.email, ...mail, headers: { "List-Unsubscribe": `<${absoluteUrl(`/review/unsubscribe/${unsubscribeToken(r.id)}`)}>` } });
          sent++;
        }
      }
    } catch (err) {
      await release(won);
      throw err;
    }
  }
  return sent;
}

/** The scheduled sweep: everything that is due. Returns how many emails went out. */
export async function sweep(now = Date.now()): Promise<number> {
  return (await sendDecisionMails({ olderThanMs: 60_000, now })) + (await sendOwnerDigests(now)) + (await sendReviewerReplyMails(now)) + (await sendNewVersionMails(now));
}

export type { MailContent };

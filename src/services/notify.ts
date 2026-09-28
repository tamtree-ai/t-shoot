import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db, schema } from "@/db";

export type NoticeKind = "comment" | "approved" | "film" | "live";

const PREF: Record<NoticeKind, "notifyComment" | "notifyApproved" | "notifyFilm" | "notifyLive"> = {
  comment: "notifyComment",
  approved: "notifyApproved",
  film: "notifyFilm",
  live: "notifyLive",
};

/**
 * Email (and Slack, if that person turned it on) for four events. Failures are
 * swallowed: a missed note must not undo the comment, the approval, or the post.
 */
export async function notify(orgId: string, kind: NoticeKind, title: string, body: string, href: string): Promise<void> {
  try {
    const members = await db.select().from(schema.members).where(eq(schema.members.orgId, orgId));
    const [org] = await db.select().from(schema.orgs).where(eq(schema.orgs.id, orgId)).limit(1);
    const pref = PREF[kind];
    for (const member of members) {
      if (!member[pref]) continue;
      await db.insert(schema.notifications).values({ orgId, memberId: member.id, kind, title, body, href });
      await db.insert(schema.mailOutbox).values({
        toEmail: member.email,
        subject: title,
        body: `${body}\n\n${href}`,
      });
      if (member.notifySlack && org?.slackWebhook) {
        await fetch(org.slackWebhook, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: `${title}\n${body}\n${href}` }),
        }).catch(() => undefined);
      }
    }
  } catch {
    // A notification is not the work.
  }
}

export async function listNotifications(memberId: string) {
  return db.select().from(schema.notifications).where(eq(schema.notifications.memberId, memberId)).orderBy(desc(schema.notifications.createdAt));
}

export async function markNotificationRead(memberId: string, id: string): Promise<void> {
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notifications.id, id), eq(schema.notifications.memberId, memberId)));
}

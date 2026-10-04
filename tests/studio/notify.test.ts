/** Mail: who gets what, when, and never twice. Events are back-dated instead of waiting; mail lands in mail_outbox (not production). */
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { type Ctx, setup } from "./helpers";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/queue", () => ({ enqueueStudioProcess: vi.fn(), enqueueStudioNotify: vi.fn(async () => undefined) }));

let c: Ctx;
let org: Awaited<ReturnType<Ctx["org"]>>;
let notify: typeof import("@/services/studio/notify");
let comments: typeof import("@/services/studio/comments");
let decisions: typeof import("@/services/studio/decisions");

const MIN = 60_000;
/** Only this test org's events: the dev database may hold real ones. */
const scoped = () => ({ orgId: org.orgId });

async function fixture(over: Record<string, unknown> = {}) {
  const t = await c.tree(org.orgId, "image", { asset: "Banner", project: "Spring" });
  const v = await c.version(org.orgId, t.variationId, { note: "first" });
  const made = await c.share(org.orgId, org.memberId, t.projectId, [t.assetId], { title: "Round one", ...over });
  const [reviewer] = await c.db.insert(c.schema.studioReviewers).values({ shareId: made.share.id, name: "Sam", email: `sam-${Math.random().toString(36).slice(2)}@acme.com` }).returning();
  const scope = (await comments.guestScope(made.share, v.versionId))!;
  const owner = (await comments.ownerScope(org.orgId, v.versionId))!;
  return { t, v, ...made, reviewer: reviewer!, scope, owner };
}
const sam = (r: { id: string }) => ({ kind: "reviewer" as const, reviewerId: r.id, label: "Sam" });
const studio = () => ({ kind: "member" as const, memberId: org.memberId, label: "Dilhan" });

/** Moves the share's project's events into the past, by `ms` (a studio reply has a project but no share). */
async function age(shareId: string, ms: number) {
  const [share] = await c.db.select().from(c.schema.studioShares).where(eq(c.schema.studioShares.id, shareId));
  await c.db.update(c.schema.studioEvents).set({ createdAt: new Date(Date.now() - ms) }).where(eq(c.schema.studioEvents.projectId, share!.projectId));
}
const mailTo = async (email: string) => c.db.select().from(c.schema.mailOutbox).where(eq(c.schema.mailOutbox.toEmail, email));
const clearBox = async () => c.db.delete(c.schema.mailOutbox).where(eq(c.schema.mailOutbox.toEmail, org.email));

beforeAll(async () => {
  c = await setup("notify");
  org = await c.org("a");
  notify = await import("@/services/studio/notify");
  comments = await import("@/services/studio/comments");
  decisions = await import("@/services/studio/decisions");
});
afterAll(async () => c.cleanup());

describe("when a digest is due", () => {
  const at = (ms: number) => ({ createdAt: new Date(ms) });
  it("waits for five quiet minutes, then goes", () => {
    const now = 10_000_000;
    expect(notify.digestDue([], 5 * MIN, now)).toBe(false);
    expect(notify.digestDue([at(now - MIN)], 5 * MIN, now)).toBe(false);
    expect(notify.digestDue([at(now - 5 * MIN)], 5 * MIN, now)).toBe(true);
  });
  it("one fresh comment keeps the others waiting, until the oldest is half an hour old", () => {
    const now = 100_000_000;
    expect(notify.digestDue([at(now - 20 * MIN), at(now - MIN)], 5 * MIN, now)).toBe(false);
    expect(notify.digestDue([at(now - 31 * MIN), at(now - MIN)], 5 * MIN, now)).toBe(true);
  });
});

describe("to the studio", () => {
  it("ten comments make one digest, five minutes after the last, and not before", async () => {
    const f = await fixture();
    await clearBox();
    for (let i = 0; i < 10; i++) await comments.addRoot(f.scope, sam(f.reviewer), { body: `Comment ${i}`, annotation: { v: 1, shape: "pin", x: 0.1 * i, y: 0.5 } });
    await age(f.share.id, 2 * MIN);
    expect(await notify.sendOwnerDigests(scoped())).toBe(0);
    expect(await mailTo(org.email)).toHaveLength(0);
    await age(f.share.id, 6 * MIN);
    expect(await notify.sendOwnerDigests(scoped())).toBe(1);
    const box = await mailTo(org.email);
    expect(box).toHaveLength(1);
    expect(box[0]!.subject).toBe("10 new comments on Round one");
    expect(box[0]!.body).toContain("Comment 0");
    expect(box[0]!.body).toContain("and 2 more");
  });

  it("never sends the same comments twice, and picks up only what came after", async () => {
    const f = await fixture();
    await clearBox();
    await comments.addRoot(f.scope, sam(f.reviewer), { body: "first batch" });
    await age(f.share.id, 6 * MIN);
    expect(await notify.sendOwnerDigests(scoped())).toBe(1);
    expect(await notify.sendOwnerDigests(scoped())).toBe(0);
    await comments.addRoot(f.scope, sam(f.reviewer), { body: "second batch" });
    expect(await notify.sendOwnerDigests(scoped())).toBe(0);
    await c.db.update(c.schema.studioEvents).set({ createdAt: new Date(Date.now() - 6 * MIN) }).where(and(eq(c.schema.studioEvents.shareId, f.share.id), eq(c.schema.studioEvents.type, "comment.added")));
    expect(await notify.sendOwnerDigests(scoped())).toBe(1);
    const bodies = (await mailTo(org.email)).map((m) => m.body).join("\n");
    expect(bodies.match(/first batch/g)).toHaveLength(1);
    expect(bodies.match(/second batch/g)).toHaveLength(1);
  });

  it("counts replies, and doesn't mail the studio about its own comments or internal notes", async () => {
    const f = await fixture();
    await clearBox();
    const root = await comments.addRoot(f.scope, sam(f.reviewer), { body: "from client" });
    await comments.addReply(f.owner, studio(), { parentId: root.id, body: "from studio" });
    await comments.addRoot(f.owner, studio(), { body: "internal only", internal: true });
    await comments.addReply(f.scope, sam(f.reviewer), { parentId: root.id, body: "client again" });
    await age(f.share.id, 6 * MIN);
    await notify.sendOwnerDigests(scoped());
    const [mail] = await mailTo(org.email);
    expect(mail!.subject).toBe("1 new comment and 1 reply on Round one");
    expect(mail!.body).not.toContain("from studio");
    expect(mail!.body).not.toContain("internal only");
  });

  it("respects each member's notification settings", async () => {
    const f = await fixture();
    await clearBox();
    await c.db.update(c.schema.members).set({ notifyComment: false }).where(eq(c.schema.members.id, org.memberId));
    await comments.addRoot(f.scope, sam(f.reviewer), { body: "quiet please" });
    await age(f.share.id, 6 * MIN);
    expect(await notify.sendOwnerDigests(scoped())).toBe(0);
    expect(await mailTo(org.email)).toHaveLength(0);
    await c.db.update(c.schema.members).set({ notifyComment: true }).where(eq(c.schema.members.id, org.memberId));
  });

  it("mails an approval at once, with a link to the sign-off", async () => {
    const f = await fixture();
    await clearBox();
    await decisions.decide(f.share, f.reviewer, { versionId: f.v.versionId, decision: "approved", signedName: "Sam Lee", confirm: true }, { ip: "1.1.1.1", ua: "t" });
    expect(await notify.sendDecisionMails({ shareId: f.share.id })).toBe(1);
    const [mail] = await mailTo(org.email);
    expect(mail!.subject).toBe("Approved: Banner · Main v1");
    expect(mail!.body).toContain("Sam approved Banner · Main v1");
    expect(mail!.body).toContain(`/studio/assets/${f.t.assetId}?option=${f.t.variationId}&v=${f.v.versionId}`);
    expect(await notify.sendDecisionMails({ shareId: f.share.id })).toBe(0);
  });

  it("mails a change request with the note, the open count and the round", async () => {
    const f = await fixture();
    await clearBox();
    await comments.addRoot(f.scope, sam(f.reviewer), { body: "logo" });
    await comments.addRoot(f.scope, sam(f.reviewer), { body: "colour" });
    await decisions.decide(f.share, f.reviewer, { versionId: f.v.versionId, decision: "changes_requested", note: "Please fix both" }, { ip: "1.1.1.1", ua: "t" });
    await notify.sendDecisionMails({ shareId: f.share.id });
    const [mail] = await mailTo(org.email);
    expect(mail!.subject).toBe("Changes requested: Banner · Main v1");
    expect(mail!.body).toContain("Please fix both");
    expect(mail!.body).toContain("2 open comments to work through");
    expect(mail!.body).toContain("Round 2 of 2");
  });

  it("the sweep catches a decision the immediate job missed, but only once it is a minute old", async () => {
    const f = await fixture();
    await clearBox();
    await decisions.decide(f.share, f.reviewer, { versionId: f.v.versionId, decision: "changes_requested" }, { ip: "1.1.1.1", ua: "t" });
    // (The sweep covers the whole test org, so judge it by what this decision did to the studio's inbox.)
    await notify.sweep(scoped());
    expect(await mailTo(org.email)).toHaveLength(0);
    await age(f.share.id, 2 * MIN);
    await notify.sweep(scoped());
    expect((await mailTo(org.email)).some((m) => m.subject.startsWith("Changes requested"))).toBe(true);
  });
});

describe("to the client", () => {
  async function signedUp(f: Awaited<ReturnType<typeof fixture>>) {
    // The reviewer wrote a comment; the studio will answer it.
    const root = await comments.addRoot(f.scope, sam(f.reviewer), { body: "Can the logo be bigger?" });
    return root;
  }

  it("a studio reply emails the people in the thread, once, two minutes after the last reply", async () => {
    const f = await fixture();
    const root = await signedUp(f);
    await comments.addReply(f.owner, studio(), { parentId: root.id, body: "Done, see v2" });
    await comments.addReply(f.owner, studio(), { parentId: root.id, body: "Also darkened it" });
    expect(await notify.sendReviewerReplyMails(scoped())).toBe(0);
    await age(f.share.id, 3 * MIN);
    expect(await notify.sendReviewerReplyMails(scoped())).toBe(1);
    const [mail] = await mailTo(f.reviewer.email);
    expect(mail!.subject).toContain("Studio a replied to your comments");
    expect(mail!.body).toContain("Done, see v2");
    expect(mail!.body).toContain("Also darkened it");
    expect(mail!.body).toContain("/review/unsubscribe/");
    expect(mail!.body).toContain(`/review/${f.token}?v=${f.v.versionId}&c=${root.id}`);
    expect(await notify.sendReviewerReplyMails(scoped())).toBe(0);
  });

  it("doesn't email someone who wasn't in the thread, or who unsubscribed", async () => {
    const f = await fixture();
    const [bystander] = await c.db.insert(c.schema.studioReviewers).values({ shareId: f.share.id, name: "Kim", email: `kim-${Math.random().toString(36).slice(2)}@acme.com` }).returning();
    const root = await signedUp(f);
    await comments.addReply(f.owner, studio(), { parentId: root.id, body: "Answer" });
    await c.db.update(c.schema.studioReviewers).set({ notify: false }).where(eq(c.schema.studioReviewers.id, f.reviewer.id));
    await age(f.share.id, 3 * MIN);
    expect(await notify.sendReviewerReplyMails(scoped())).toBe(0);
    expect(await mailTo(f.reviewer.email)).toHaveLength(0);
    expect(await mailTo(bystander!.email)).toHaveLength(0);
  });

  it("doesn't email when the link has ended", async () => {
    const f = await fixture();
    const root = await signedUp(f);
    await comments.addReply(f.owner, studio(), { parentId: root.id, body: "Answer" });
    await (await import("@/services/studio/shares")).revokeShare(org.orgId, f.share.id);
    await age(f.share.id, 3 * MIN);
    expect(await notify.sendReviewerReplyMails(scoped())).toBe(0);
  });

  it("a new version emails reviewers on a share that follows the latest, once it is processed and the studio has stopped uploading", async () => {
    const f = await fixture();
    const v2 = await c.version(org.orgId, f.t.variationId, { note: "Logo larger" });
    await c.db.insert(c.schema.studioEvents).values({ orgId: org.orgId, projectId: f.t.projectId, actorLabel: "You", type: "version.uploaded", payload: { versionId: v2.versionId, where: "Banner · Main v2" } });
    expect(await notify.sendNewVersionMails(scoped())).toBe(0);
    await c.db.update(c.schema.studioEvents).set({ createdAt: new Date(Date.now() - 11 * MIN) }).where(and(eq(c.schema.studioEvents.projectId, f.t.projectId), eq(c.schema.studioEvents.type, "version.uploaded")));
    expect(await notify.sendNewVersionMails(scoped())).toBeGreaterThanOrEqual(1);
    const [mail] = await mailTo(f.reviewer.email);
    expect(mail!.subject).toContain("A new version is ready: Banner · Main v2");
    expect(mail!.body).toContain("What changed: Logo larger");
    expect(mail!.body).toContain(`/review/${f.token}?v=${v2.versionId}`);
  });

  it("not for a pinned share, which won't show the new version, and not while the file is still processing", async () => {
    const pinned = await fixture({ versionMode: "pinned" });
    const v2 = await c.version(org.orgId, pinned.t.variationId);
    await c.db.insert(c.schema.studioEvents).values({ orgId: org.orgId, projectId: pinned.t.projectId, actorLabel: "You", type: "version.uploaded", payload: { versionId: v2.versionId, where: "x" }, createdAt: new Date(Date.now() - 30 * MIN) });
    await notify.sendNewVersionMails(scoped());
    expect(await mailTo(pinned.reviewer.email)).toHaveLength(0);

    const f = await fixture();
    const v3 = await c.version(org.orgId, f.t.variationId);
    await c.db.update(c.schema.studioFiles).set({ processing: "pending" }).where(eq(c.schema.studioFiles.id, v3.fileId));
    await c.db.insert(c.schema.studioEvents).values({ orgId: org.orgId, projectId: f.t.projectId, actorLabel: "You", type: "version.uploaded", payload: { versionId: v3.versionId, where: "x" }, createdAt: new Date(Date.now() - 30 * MIN) });
    await notify.sendNewVersionMails(scoped());
    expect(await mailTo(f.reviewer.email)).toHaveLength(0);
    // Once processed, the next sweep sends it.
    await c.db.update(c.schema.studioFiles).set({ processing: "ready" }).where(eq(c.schema.studioFiles.id, v3.fileId));
    await notify.sendNewVersionMails(scoped());
    expect(await mailTo(f.reviewer.email)).toHaveLength(1);
  });
});

describe("claims", () => {
  it("two sweeps at once send one email, not two", async () => {
    const f = await fixture();
    await clearBox();
    await comments.addRoot(f.scope, sam(f.reviewer), { body: "race" });
    await age(f.share.id, 6 * MIN);
    const [a, b] = await Promise.all([notify.sendOwnerDigests(scoped()), notify.sendOwnerDigests(scoped())]);
    expect(a + b).toBe(1);
    expect(await mailTo(org.email)).toHaveLength(1);
  });

  it("gives the claim back when sending fails, so the next sweep retries", async () => {
    const f = await fixture();
    await clearBox();
    await comments.addRoot(f.scope, sam(f.reviewer), { body: "retry me" });
    await age(f.share.id, 6 * MIN);
    const mailer = await import("@/services/studio/mailer");
    const spy = vi.spyOn(mailer, "sendStudioMail").mockRejectedValueOnce(new Error("smtp down"));
    await expect(notify.sendOwnerDigests(scoped())).rejects.toThrow("smtp down");
    spy.mockRestore();
    const pending = await c.db.select().from(c.schema.studioEvents).where(and(eq(c.schema.studioEvents.shareId, f.share.id), eq(c.schema.studioEvents.type, "comment.added")));
    expect(pending.every((e) => e.notifiedAt === null)).toBe(true);
    expect(await notify.sendOwnerDigests(scoped())).toBe(1);
  });
});

describe("the mailer", () => {
  it("always records in mail_outbox, and only sends in production", async () => {
    const mailer = await import("@/services/studio/mailer");
    const sent: unknown[] = [];
    process.env.MAIL_WEBHOOK_URL = "http://hook.test/mail";
    mailer.resetMailer();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_u, init) => {
      sent.push(JSON.parse(String((init as RequestInit).body)));
      return new Response("ok");
    });
    const to = `mailer-${Math.random().toString(36).slice(2)}@x.co`;
    await mailer.sendStudioMail({ to, subject: "Dev", text: "t" }, { production: false });
    expect(sent).toHaveLength(0);
    await mailer.sendStudioMail({ to, subject: "Prod", text: "t", html: "<p>t</p>" }, { production: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to, subject: "Prod", html: "<p>t</p>" });
    expect((await mailTo(to)).map((m) => m.subject).sort()).toEqual(["Dev", "Prod"]);
    fetchSpy.mockRestore();
    delete process.env.MAIL_WEBHOOK_URL;
    mailer.resetMailer();
    await c.db.delete(c.schema.mailOutbox).where(inArray(c.schema.mailOutbox.toEmail, [to]));
  });

  it("recipients are the org's owners and editors, minus anyone who switched that kind off", async () => {
    const mailer = await import("@/services/studio/mailer");
    const [editor] = await c.db.insert(c.schema.members).values({ orgId: org.orgId, email: `editor-${Math.random().toString(36).slice(2)}@x.co`, role: "editor", notifyApproved: false }).returning();
    await c.db.insert(c.schema.members).values({ orgId: org.orgId, email: `client-${Math.random().toString(36).slice(2)}@x.co`, role: "client" });
    expect(await mailer.studioRecipients(org.orgId, "comment")).toContain(editor!.email);
    expect(await mailer.studioRecipients(org.orgId, "decision")).not.toContain(editor!.email);
    expect((await mailer.studioRecipients(org.orgId, "comment")).some((e) => e.startsWith("client-"))).toBe(false);
  });
});

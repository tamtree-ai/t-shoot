import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";

import { db, schema } from "@/db";
import { SESSION_COOKIE, type MemberRole } from "@/lib/auth";
import { hashToken, newToken } from "@/lib/session-token";

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const LINK_MS = 30 * 60 * 1000;

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MONTH_MS / 1000,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

async function openSession(memberId: string): Promise<string> {
  const token = newToken();
  await db.insert(schema.sessions).values({
    memberId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + MONTH_MS),
  });
  return token;
}

async function deliver(to: string, subject: string, body: string): Promise<void> {
  await db.insert(schema.mailOutbox).values({ toEmail: to, subject, body });
  const webhook = process.env.MAIL_WEBHOOK_URL;
  if (!webhook) return;
  await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ to, subject, text: body }),
  }).catch(() => undefined);
}

function showDevLink(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.TAMSHOOT_SHOW_MAGIC_LINK === "1";
}

export async function requestMagicLink(email: string, origin: string): Promise<{ devLink?: string }> {
  const normalised = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalised)) throw new Error("Enter an email address.");
  const [member] = await db.select().from(schema.members).where(eq(schema.members.email, normalised)).limit(1);
  if (!member) throw new Error("That email isn't in this workspace. Ask the owner for an invite.");
  const token = newToken();
  await db.insert(schema.magicLinks).values({
    email: normalised,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + LINK_MS),
  });
  const link = `${origin}/sign-in/use?token=${token}`;
  await deliver(normalised, "Your t-shoot sign-in link", `Open this link to sign in. It expires in 30 minutes.\n\n${link}`);
  return showDevLink() ? { devLink: link } : {};
}

export async function consumeMagicLink(token: string): Promise<void> {
  const [link] = await db.select().from(schema.magicLinks).where(eq(schema.magicLinks.tokenHash, hashToken(token))).limit(1);
  if (!link || link.usedAt || link.expiresAt < new Date()) throw new Error("That sign-in link has expired. Request another.");
  const [member] = await db.select().from(schema.members).where(eq(schema.members.email, link.email)).limit(1);
  if (!member) throw new Error("That email isn't in this workspace.");
  await db.update(schema.magicLinks).set({ usedAt: new Date() }).where(eq(schema.magicLinks.id, link.id));
  await setSessionCookie(await openSession(member.id));
}

export async function inviteMember(orgId: string, invitedBy: string, email: string, role: MemberRole, origin: string): Promise<{ devLink?: string }> {
  if (role === "owner") throw new Error("There is already an owner.");
  const normalised = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalised)) throw new Error("Enter an email address.");
  const [existing] = await db.select().from(schema.members).where(and(eq(schema.members.orgId, orgId), eq(schema.members.email, normalised))).limit(1);
  if (existing) throw new Error("That person is already in the workspace.");
  const token = newToken();
  await db.insert(schema.invites).values({
    orgId,
    email: normalised,
    role,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    invitedBy,
  });
  const link = `${origin}/sign-in/invite?token=${token}`;
  await deliver(normalised, "You're invited to t-shoot", `Open this link to join. It expires in 7 days.\n\n${link}`);
  return showDevLink() ? { devLink: link } : {};
}

export async function acceptInvite(token: string, name: string): Promise<void> {
  const [invite] = await db.select().from(schema.invites).where(eq(schema.invites.tokenHash, hashToken(token))).limit(1);
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) throw new Error("That invite has expired.");
  const trimmed = name.trim().slice(0, 60);
  if (!trimmed) throw new Error("Add your name.");
  const [member] = await db
    .insert(schema.members)
    .values({ orgId: invite.orgId, email: invite.email, name: trimmed, role: invite.role })
    .returning();
  if (!member) throw new Error("The invite could not be accepted.");
  await db.update(schema.invites).set({ acceptedAt: new Date() }).where(eq(schema.invites.id, invite.id));
  if (member.role === "client") {
    await db.insert(schema.clientPortals).values({ orgId: member.orgId, memberId: member.id, token: newToken() });
  }
  await setSessionCookie(await openSession(member.id));
}

export async function listMembers(orgId: string) {
  return db.select().from(schema.members).where(eq(schema.members.orgId, orgId));
}

export async function updateNotifyPrefs(
  memberId: string,
  prefs: { notifyComment: boolean; notifyApproved: boolean; notifyFilm: boolean; notifyLive: boolean; notifySlack: boolean },
): Promise<void> {
  await db.update(schema.members).set(prefs).where(eq(schema.members.id, memberId));
}

export async function setSlackWebhook(orgId: string, url: string): Promise<void> {
  const trimmed = url.trim();
  if (trimmed && !trimmed.startsWith("https://")) throw new Error("The Slack webhook has to start with https://");
  await db.update(schema.orgs).set({ slackWebhook: trimmed || null }).where(eq(schema.orgs.id, orgId));
}

export async function setVoiceCloneConsent(memberId: string, consent: boolean): Promise<void> {
  await db.update(schema.members).set({ voiceCloneConsent: consent }).where(eq(schema.members.id, memberId));
}

export async function getOrg(orgId: string) {
  const [org] = await db.select().from(schema.orgs).where(eq(schema.orgs.id, orgId)).limit(1);
  return org ?? null;
}

export async function memberById(memberId: string) {
  const [member] = await db.select().from(schema.members).where(eq(schema.members.id, memberId)).limit(1);
  return member ?? null;
}

export async function portalForMember(memberId: string) {
  const [row] = await db.select().from(schema.clientPortals).where(eq(schema.clientPortals.memberId, memberId)).limit(1);
  return row ?? null;
}

export async function unreadCount(memberId: string): Promise<number> {
  const rows = await db
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.memberId, memberId), isNull(schema.notifications.readAt)));
  return rows.length;
}

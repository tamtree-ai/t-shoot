/**
 * The signed-in member, from the session cookie. Nobody signed in: sign-in, except with
 * `TAMSHOOT_AUTH=local` (standalone, 127.0.0.1 only), where the seeded owner is always signed in.
 * `proxy.ts` only checks that a cookie is present; this is the real check, so every page, action
 * and route that reads org data calls it.
 */
import "server-only";

import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { db, schema } from "@/db";
import { hashToken, SESSION_COOKIE } from "@/lib/session-token";
import { isLocalAuth } from "@/lib/standalone";

export type MemberRole = "owner" | "editor" | "client";

export type CurrentMember = {
  memberId: string;
  orgId: string;
  name: string | null;
  email: string;
  role: MemberRole;
};

export { SESSION_COOKIE };

function toMember(member: typeof schema.members.$inferSelect): CurrentMember {
  return {
    memberId: member.id,
    orgId: member.orgId,
    name: member.name,
    email: member.email,
    role: member.role,
  };
}

export const getCurrentMember = cache(async (): Promise<CurrentMember> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const [session] = await db
      .select()
      .from(schema.sessions)
      .where(and(eq(schema.sessions.tokenHash, hashToken(token)), gt(schema.sessions.expiresAt, new Date())))
      .limit(1);
    if (session) {
      const [member] = await db.select().from(schema.members).where(eq(schema.members.id, session.memberId)).limit(1);
      if (member) return toMember(member);
    }
  }
  if (!isLocalAuth()) redirect("/sign-in");
  const [member] = await db.select().from(schema.members).where(eq(schema.members.role, "owner")).limit(1);
  if (!member) {
    throw new Error("No seeded member found. Run `pnpm db:seed` before starting the app.");
  }
  return toMember(member);
});

/** Owners and editors spend and change settings. Clients review. */
export function canSpend(role: MemberRole): boolean {
  return role !== "client";
}

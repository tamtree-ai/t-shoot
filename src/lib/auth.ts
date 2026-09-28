/**
 * Session cookie when someone has signed in; otherwise the seeded owner, so the
 * existing app and its tests keep working until a session is present.
 */
import "server-only";

import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";

import { db, schema } from "@/db";
import { hashToken } from "@/lib/session-token";

export type MemberRole = "owner" | "editor" | "client";

export type CurrentMember = {
  memberId: string;
  orgId: string;
  name: string | null;
  email: string;
  role: MemberRole;
};

export const SESSION_COOKIE = "tshoot_session";

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

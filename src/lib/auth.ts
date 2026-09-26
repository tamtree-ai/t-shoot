/**
 * Auth stub (07 §4, F1: "Auth (magic link) can stay stubbed to one seeded owner until
 * F5"). There is exactly one org and one member in a dev database — `pnpm db:seed`
 * creates them. Real magic-link auth and multi-member orgs land in S6/F5.
 */
import "server-only";

import { eq } from "drizzle-orm";

import { db, schema } from "@/db";

export type CurrentMember = {
  memberId: string;
  orgId: string;
  name: string | null;
  email: string;
  role: "owner" | "editor";
};

let cached: CurrentMember | null = null;

/** The single seeded owner. Throws if `pnpm db:seed` has not run. */
export async function getCurrentMember(): Promise<CurrentMember> {
  if (cached) return cached;
  const [member] = await db.select().from(schema.members).where(eq(schema.members.role, "owner")).limit(1);
  if (!member) {
    throw new Error("No seeded member found. Run `pnpm db:seed` before starting the app.");
  }
  cached = { memberId: member.id, orgId: member.orgId, name: member.name, email: member.email, role: member.role };
  return cached;
}

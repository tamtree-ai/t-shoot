import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";

export type WaitingShort = {
  projectId: string;
  title: string;
  token: string;
  approved: boolean;
};

/** Shorts with a live review link. Approved ones stay so the playlist can skip them. */
export async function waitingShorts(orgId: string): Promise<WaitingShort[]> {
  const projects = await db.select().from(schema.projects).where(eq(schema.projects.orgId, orgId));
  const ids = new Set(projects.map((p) => p.id));
  const versions = await db.select().from(schema.projectVersions);
  const links = await db.select().from(schema.reviewLinks).where(isNull(schema.reviewLinks.revokedAt));
  const rows: WaitingShort[] = [];
  for (const version of versions) {
    if (!ids.has(version.projectId)) continue;
    const link = links.find((l) => l.versionId === version.id);
    if (!link) continue;
    const project = projects.find((p) => p.id === version.projectId);
    if (!project) continue;
    rows.push({
      projectId: project.id,
      title: project.title,
      token: link.token,
      approved: Boolean(version.approvedBy),
    });
  }
  return rows;
}

export async function portalByToken(token: string) {
  const [portal] = await db.select().from(schema.clientPortals).where(eq(schema.clientPortals.token, token)).limit(1);
  if (!portal) return null;
  const [member] = await db.select().from(schema.members).where(and(eq(schema.members.id, portal.memberId), eq(schema.members.role, "client"))).limit(1);
  if (!member) return null;
  return { portal, member, shorts: await waitingShorts(portal.orgId) };
}

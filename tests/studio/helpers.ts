/**
 * Shared setup for the Studio Review service tests: real Postgres (the dev DB), a throwaway data
 * dir, throwaway orgs. Call `vi.mock("server-only", …)` and mock `@/lib/queue` in the test file.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { eq, inArray, sql } from "drizzle-orm";

export type Ctx = Awaited<ReturnType<typeof setup>>;

export async function setup(label: string) {
  const dataDir = await mkdtemp(path.join(tmpdir(), `studio-${label}-`));
  process.env.STUDIO_DATA_DIR = dataDir;
  process.env.DATABASE_URL ??= "postgres://tamshoot:tamshoot@localhost:5433/tamshoot";
  const { db, schema } = await import("@/db");
  const { getBlobStore } = await import("@/lib/blob");
  const orgIds: string[] = [];

  async function org(name: string) {
    const [o] = await db.insert(schema.orgs).values({ name: `studio-${label}-${name}` }).returning();
    orgIds.push(o!.id);
    const [member] = await db.insert(schema.members).values({ orgId: o!.id, email: `${label}-${name}-${randomUUID().slice(0, 8)}@example.com`, name: `Owner ${name}`, role: "owner" }).returning();
    await db.insert(schema.studioBrand).values({ orgId: o!.id, studioName: `Studio ${name}`, accentHex: "#ff6a3d" });
    return { orgId: o!.id, memberId: member!.id, email: member!.email };
  }

  async function tree(orgId: string, kind: "image" | "video" = "image", names: { client?: string; project?: string; asset?: string } = {}) {
    const [client] = await db.insert(schema.studioClients).values({ orgId, name: names.client ?? "Acme" }).returning();
    const [project] = await db.insert(schema.studioProjects).values({ orgId, clientId: client!.id, name: names.project ?? "Spring", roundsIncluded: 2 }).returning();
    const [asset] = await db.insert(schema.studioAssets).values({ projectId: project!.id, title: names.asset ?? "Banner", kind }).returning();
    const [variation] = await db.insert(schema.studioVariations).values({ assetId: asset!.id, label: "Main" }).returning();
    return { clientId: client!.id, projectId: project!.id, assetId: asset!.id, variationId: variation!.id };
  }

  /** A ready file with distinguishable blobs, and a version pointing at it. No sharp or ffmpeg needed. */
  async function version(orgId: string, variationId: string, opts: { mime?: string; note?: string; status?: "in_review" | "changes_requested" | "approved" } = {}) {
    const fileId = randomUUID();
    const mime = opts.mime ?? "image/png";
    const video = mime.startsWith("video/");
    const base = `${orgId}/${fileId}`;
    const store = getBlobStore();
    const put = async (key: string, text: string) => store.put(key, new Blob([text]).stream());
    const original = await put(`${base}/original`, "ORIGINAL");
    await put(`${base}/preview`, "CLEAN-PREVIEW");
    await put(`${base}/wm`, "MARKED-PREVIEW");
    await put(`${base}/poster`, "POSTER");
    await put(`${base}/thumb`, "THUMB");
    await db.insert(schema.studioFiles).values({
      id: fileId,
      orgId,
      originalKey: `${base}/original`,
      originalName: video ? "teaser.mp4" : "banner.png",
      mime,
      bytes: original.size,
      sha256: original.sha256,
      width: 1600,
      height: 900,
      durationS: video ? 10 : null,
      fpsNum: video ? 30 : null,
      fpsDen: video ? 1 : null,
      previewKey: `${base}/preview`,
      wmPreviewKey: `${base}/wm`,
      posterKey: video ? `${base}/poster` : null,
      thumbKey: `${base}/thumb`,
      processing: "ready",
    });
    const [{ n }] = (await db.select({ n: sql<number>`coalesce(max(${schema.studioVersions.number}), 0) + 1` }).from(schema.studioVersions).where(eq(schema.studioVersions.variationId, variationId))) as [{ n: number }];
    const [v] = await db.insert(schema.studioVersions).values({ variationId, number: Number(n), fileId, changeNote: opts.note ?? "", status: opts.status ?? "in_review" }).returning();
    return { versionId: v!.id, fileId, number: v!.number, sha256: original.sha256 };
  }

  async function share(orgId: string, memberId: string, projectId: string, assetIds: string[], over: Record<string, unknown> = {}) {
    const shares = await import("@/services/studio/shares");
    return shares.createShare(orgId, memberId, projectId, { title: "Review", message: "", notes: [], expiresAt: null, downloadPolicy: "after_approval", watermark: true, commentsOpen: true, versionMode: "latest", assetIds, ...over } as never);
  }

  async function cleanup() {
    // Versions point at files with no cascade, so the trees go first; then the orgs take everything else.
    if (orgIds.length) {
      const emails = (await db.select({ e: schema.members.email }).from(schema.members).where(inArray(schema.members.orgId, orgIds))).map((r) => r.e);
      await db.delete(schema.studioClients).where(inArray(schema.studioClients.orgId, orgIds));
      for (const id of orgIds) await db.delete(schema.orgs).where(eq(schema.orgs.id, id));
      if (emails.length) await db.delete(schema.mailOutbox).where(inArray(schema.mailOutbox.toEmail, emails));
    }
    await rm(dataDir, { recursive: true, force: true });
  }

  return { db, schema, org, tree, version, share, cleanup, dataDir, store: getBlobStore() };
}

/**
 * Export (03 §1.6): snapshot the timeline as a version and render it. Export is blocked
 * while any scene isn't Ready or any voice is out of date. Rendering costs nothing
 * (07 §3), but it still goes through `requestRun` with an explicit $0 estimate.
 */
import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { aiClips } from "@/types/ai-clips";
import { requestRun } from "./dispatcher";
import { getEditModel } from "./edit-model";
import { snapshot } from "./versions";

export async function requestFinalRender(projectId: string, memberId: string): Promise<{ versionId: string }> {
  const model = await getEditModel(projectId);
  if (!model) throw new Error("Project not found.");
  if (!model.canExport) throw new Error(model.exportBlockedReason ?? "This video isn’t ready to export.");

  const version = await snapshot(projectId);
  if (version.renderAssetId) return { versionId: version.id };

  const previous = await db
    .select({ id: schema.runs.id })
    .from(schema.runs)
    .where(and(eq(schema.runs.projectId, projectId), eq(schema.runs.stage, aiClips.flows.render)));
  await requestRun({
    projectId,
    stage: aiClips.flows.render,
    input: { timeline: version.timeline, mode: "final" },
    estimateUsd: "0.000000",
    confirmedBy: memberId,
    idempotencyKey: `render:${projectId}:${version.digest}:${previous.length}`,
  });
  await db.update(schema.projects).set({ step: "export", updatedAt: new Date() }).where(eq(schema.projects.id, projectId));
  return { versionId: version.id };
}

export async function getExportModel(projectId: string) {
  const model = await getEditModel(projectId);
  if (!model) return null;
  const versions = await db.select().from(schema.projectVersions).where(eq(schema.projectVersions.projectId, projectId)).orderBy(desc(schema.projectVersions.number));
  const [render] = await db
    .select()
    .from(schema.runs)
    .where(and(eq(schema.runs.projectId, projectId), eq(schema.runs.stage, aiClips.flows.render)))
    .orderBy(desc(schema.runs.createdAt))
    .limit(1);
  const rendering = !!render && !["completed", "failed", "cancelled"].includes(render.status);
  return {
    project: model.project,
    canExport: model.canExport,
    blockedReason: model.exportBlockedReason,
    rendering,
    renderFailed: render?.status === "failed",
    versions: versions.map((v) => ({
      id: v.id,
      number: v.number,
      digest: v.digest,
      createdAt: v.createdAt.toISOString(),
      renderAssetId: v.renderAssetId,
      approvedBy: v.approvedBy,
      durationS: (v.timeline as { duration_s?: number }).duration_s ?? 0,
    })),
  };
}

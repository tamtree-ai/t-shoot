import { notFound } from "next/navigation";

import { ProjectBar } from "@/components/ProjectBar";
import { db, schema } from "@/db";
import { locate } from "@/lib/timeline";
import { projectComments } from "@/services/review";
import { listVersions } from "@/services/versions";
import { eq } from "drizzle-orm";
import { ReviewOwner } from "./ReviewOwner";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, id));
  if (!project) notFound();
  const versions = await listVersions(id);
  const links = versions.length
    ? (await db.select().from(schema.reviewLinks)).filter((l) => versions.some((v) => v.id === l.versionId) && !l.revokedAt)
    : [];
  const comments = await projectComments(id);

  return (
    <>
      <ProjectBar projectId={id} title={project.title} current="review" />
      <ReviewOwner
        projectId={id}
        versions={versions.map((v) => ({ id: v.id, number: v.number, createdAt: v.createdAt.toISOString(), approvedBy: v.approvedBy, durationS: (v.timeline as { duration_s?: number }).duration_s ?? 0 }))}
        links={links.map((l) => ({ id: l.id, token: l.token, versionId: l.versionId }))}
        comments={comments.map((c) => ({
          id: c.id,
          authorName: c.authorName,
          timecodeS: c.timecodeS,
          body: c.body,
          versionNumber: c.versionNumber,
          scenePosition: (() => { const hit = locate(c.timeline, c.timecodeS); return hit ? c.timeline.scenes.findIndex((s) => s.scene_id === hit.sceneId) + 1 : null; })(),
          resolved: !!c.resolvedByChangeRequestId,
        }))}
      />
    </>
  );
}

import { notFound } from "next/navigation";

import { ProjectBar } from "@/components/ProjectBar";
import { db, schema } from "@/db";
import { locate } from "@/lib/timeline";
import { projectComments } from "@/services/review";
import { listVersions } from "@/services/versions";
import { eq } from "drizzle-orm";
import { typeOf } from "@/types/registry";
import { versionMedia } from "@/types/versions";
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
      <ProjectBar projectId={id} title={project.title} current="review" steps={typeOf(project).steps} />
      <ReviewOwner
        projectId={id}
        changeStep={(typeOf(project).steps as readonly string[]).includes("edit") ? "edit" : "script"}
        versions={versions.map((v) => ({ id: v.id, number: v.number, createdAt: v.createdAt.toISOString(), approvedBy: v.approvedBy, durationS: versionMedia(v).durationS }))}
        links={links.map((l) => ({ id: l.id, token: l.token, versionId: l.versionId }))}
        comments={comments.map((c) => ({
          id: c.id,
          authorName: c.authorName,
          timecodeS: c.timecodeS,
          body: c.body,
          versionNumber: c.versionNumber,
          scenePosition: (() => {
            if (c.media.kind !== "timeline") return null;
            const { timeline } = c.media;
            const hit = locate(timeline, c.timecodeS);
            return hit ? timeline.scenes.findIndex((s) => s.scene_id === hit.sceneId) + 1 : null;
          })(),
          resolved: !!c.resolvedByChangeRequestId,
        }))}
      />
    </>
  );
}

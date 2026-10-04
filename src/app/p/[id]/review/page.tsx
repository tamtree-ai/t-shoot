import { notFound } from "next/navigation";

import { ProjectBar } from "@/components/ProjectBar";
import { db, schema } from "@/db";
import { aspectOfBrief, aspectOfSkit } from "@/lib/stick/frame";
import { getCurrentMember } from "@/lib/auth";
import { locate } from "@/lib/timeline";
import { getProject } from "@/services/projects";
import { projectComments } from "@/services/review";
import { listVersions } from "@/services/versions";
import { typeOf } from "@/types/registry";
import { versionMedia } from "@/types/versions";
import { ReviewOwner } from "./ReviewOwner";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  await getCurrentMember();
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  const versions = await listVersions(id);
  const links = versions.length
    ? (await db.select().from(schema.reviewLinks)).filter((l) => versions.some((v) => v.id === l.versionId) && !l.revokedAt)
    : [];
  const comments = await projectComments(id);

  const films = versions.flatMap((v) => {
    const media = versionMedia(v);
    if (media.kind !== "video") return [];
    return [{
      id: v.id,
      number: v.number,
      durationS: media.durationS,
      src: `/api/media/${media.mp4AssetId}?name=${encodeURIComponent(`${project.title}-v${v.number}.mp4`)}`,
      frame: aspectOfSkit((v.payload as { skit?: unknown }).skit, aspectOfBrief(project.brief)),
    }];
  });

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <ProjectBar projectId={id} title={project.title} current="review" steps={typeOf(project).steps} />
      <ReviewOwner
        projectId={id}
        films={films}
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
          dismissed: !!c.dismissedAt,
        }))}
      />
    </div>
  );
}

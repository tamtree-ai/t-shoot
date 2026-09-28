import { ProjectBar } from "@/components/ProjectBar";
import { db, schema } from "@/db";
import { displayTitle } from "@/lib/display-title";
import type { Project } from "@/db/schema";
import { getCurrentMember } from "@/lib/auth";
import { getShow } from "@/services/shows";
import { memberById } from "@/services/workspace";
import { listVersions } from "@/services/versions";
import { stickSkit, type StickVersionPayload } from "@/types/stick-skit";
import { StickSkitExportStudio, type ExportCut } from "./StickSkitExportStudio";
import { listPublications } from "@/services/publish";
import { getSkitDraft } from "@/services/skit";

const media = (assetId: string, name: string) => `/api/media/${assetId}?name=${encodeURIComponent(name)}`;

/**
 * Export for `stick_skit`: the version plays on the page. Caption, hashtags, the
 * AI-voice line and a cover frame come from files the render already wrote.
 */
export async function StickSkitExport({ project }: { project: Project }) {
  const versions = await listVersions(project.id);
  const links = versions.length
    ? (await db.select().from(schema.reviewLinks)).filter((l) => versions.some((v) => v.id === l.versionId) && !l.revokedAt)
    : [];
  const title = displayTitle(project.title);
  const stored = await listPublications(project.id);
  const draft = await getSkitDraft(project.id);
  const lineCount = Array.isArray(draft?.lines) ? Math.max(1, draft.lines.length) : 1;
  const member = await getCurrentMember();
  const [viewer, show] = await Promise.all([
    memberById(member.memberId),
    project.showId ? getShow(project.orgId, project.showId) : Promise.resolve(null),
  ]);
  const cuts: ExportCut[] = versions.map((v) => {
    const p = v.payload as unknown as StickVersionPayload;
    const link = links.find((l) => l.versionId === v.id);
    const file = (ext: string) => `${title}-v${v.number}.${ext}`;
    return {
      id: v.id,
      number: v.number,
      createdAt: v.createdAt.toISOString(),
      approvedBy: v.approvedBy,
      durationS: p.duration_s,
      mp4: media(p.render.mp4, file("mp4")),
      srt: media(p.render.srt, file("srt")),
      txt: media(p.render.txt, file("txt")),
      ...(p.render.cover ? { cover: media(p.render.cover, file("png")) } : {}),
      ...(p.render.thumbnail ? { thumbnail: media(p.render.thumbnail, file("jpg")) } : {}),
      ...(p.reminder ? { reminder: p.reminder } : {}),
      reviewUrl: link ? `/r/${link.token}` : null,
    };
  });

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <ProjectBar projectId={project.id} title={project.title} current="export" steps={stickSkit.steps} />
      <StickSkitExportStudio projectId={project.id} title={title} cuts={cuts} posts={stored} lineCount={lineCount} brand={show?.config.brand} voiceConsent={viewer?.voiceCloneConsent ?? false} />
    </div>
  );
}

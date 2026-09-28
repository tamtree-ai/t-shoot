import { notFound } from "next/navigation";

import { ProjectBar } from "@/components/ProjectBar";
import type { Project } from "@/db/schema";
import { getExportModel } from "@/services/export";
import { listPublications } from "@/services/publish";
import { getActiveScenes } from "@/services/projects";
import { ExportView } from "./ExportView";

/** Export for `ai_clips` (03 §1.6): snapshot the timeline, render it once, download versions. */
export async function AiClipsExport({ project }: { project: Project }) {
  const model = await getExportModel(project.id);
  if (!model) notFound();
  const scenes = await getActiveScenes(project.id);
  const posts = await listPublications(project.id).catch(() => []);
  const caption = scenes.map((s) => s.narration.trim()).filter(Boolean).join(" ");
  return (
    <>
      <ProjectBar projectId={project.id} title={model.project.title} current="export" />
      <ExportView model={model} pack={{ caption, hashtags: "", aiLine: "Footage and voices are AI-generated.", posts }} />
    </>
  );
}

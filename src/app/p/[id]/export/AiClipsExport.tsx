import { notFound } from "next/navigation";

import { ProjectBar } from "@/components/ProjectBar";
import type { Project } from "@/db/schema";
import { getExportModel } from "@/services/export";
import { ExportView } from "./ExportView";

/** Export for `ai_clips` (03 §1.6): snapshot the timeline, render it once, download versions. */
export async function AiClipsExport({ project }: { project: Project }) {
  const model = await getExportModel(project.id);
  if (!model) notFound();
  return (
    <>
      <ProjectBar projectId={project.id} title={model.project.title} current="export" />
      <ExportView model={model} />
    </>
  );
}

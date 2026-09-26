import { notFound } from "next/navigation";

import { getProject } from "@/services/projects";
import { projectUi } from "@/types/ui";

/** The `script` step: each production type draws its own draft screen (09 §2). */
export default async function ScriptPage({ params }: PageProps<"/p/[id]/script">) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  const { DraftScreen } = projectUi(project);
  return <DraftScreen project={project} />;
}

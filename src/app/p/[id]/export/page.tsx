import { notFound } from "next/navigation";

import { getProject } from "@/services/projects";
import { projectUi } from "@/types/ui";

export const dynamic = "force-dynamic";

/** The `export` step: each production type draws its own (09 §2). */
export default async function ExportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  const { ExportScreen } = projectUi(project);
  return <ExportScreen project={project} />;
}

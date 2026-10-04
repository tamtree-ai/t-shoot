import { notFound } from "next/navigation";

import { getCurrentMember } from "@/lib/auth";
import { getProject } from "@/services/projects";
import { projectUi } from "@/types/ui";

/** The `script` step: each production type draws its own draft screen (09 §2). */
export default async function ScriptPage({ params, searchParams }: PageProps<"/p/[id]/script">) {
  await getCurrentMember();
  const { id } = await params;
  const { change } = await searchParams;
  const project = await getProject(id);
  if (!project) notFound();
  const { DraftScreen } = projectUi(project);
  return <DraftScreen project={project} changeFromComment={typeof change === "string" ? change : undefined} />;
}

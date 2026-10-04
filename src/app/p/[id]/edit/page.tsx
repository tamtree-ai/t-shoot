import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { db, schema } from "@/db";
import { getCurrentMember } from "@/lib/auth";
import { locate } from "@/lib/timeline";
import { getEditModel } from "@/services/edit-model";
import { getProject } from "@/services/projects";
import { typeOf } from "@/types/registry";
import { EditWorkspace } from "./EditWorkspace";

export const dynamic = "force-dynamic";

export default async function EditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ change?: string }> }) {
  await getCurrentMember();
  const { id } = await params;
  const { change } = await searchParams;
  const project = await getProject(id);
  if (!project) notFound();
  if (!(typeOf(project).steps as readonly string[]).includes("edit")) redirect(`/p/${id}/script`);
  const model = await getEditModel(id);
  if (!model) notFound();
  if (!model.project.scriptApproved) redirect(`/p/${id}/script`);

  // "Turn into a change": a client's comment opens Ask for a change on the scene it was left on.
  let initialChange: { sceneId: string; note: string; commentId: string } | undefined;
  if (change) {
    const [comment] = await db.select().from(schema.comments).where(eq(schema.comments.id, change));
    if (comment) {
      const [version] = await db.select().from(schema.projectVersions).where(eq(schema.projectVersions.id, comment.versionId));
      const hit = version && version.projectId === id ? locate(version.payload as never, comment.timecodeS) : null;
      if (hit && model.scenes.some((s) => s.id === hit.sceneId)) initialChange = { sceneId: hit.sceneId, note: comment.body, commentId: comment.id };
    }
  }
  return <EditWorkspace model={model} initialChange={initialChange} />;
}

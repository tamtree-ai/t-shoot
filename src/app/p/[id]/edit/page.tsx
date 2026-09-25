import { notFound, redirect } from "next/navigation";

import { getEditModel } from "@/services/edit-model";
import { EditWorkspace } from "./EditWorkspace";

export const dynamic = "force-dynamic";

export default async function EditPage({ params }: PageProps<"/p/[id]/edit">) {
  const { id } = await params;
  const model = await getEditModel(id);
  if (!model) notFound();
  if (!model.project.scriptApproved) redirect(`/p/${id}/script`);
  return <EditWorkspace model={model} />;
}

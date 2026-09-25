import { notFound } from "next/navigation";

import { ProjectBar } from "@/components/ProjectBar";
import { getExportModel } from "@/services/export";
import { ExportView } from "./ExportView";

export const dynamic = "force-dynamic";

export default async function ExportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const model = await getExportModel(id);
  if (!model) notFound();
  return (
    <>
      <ProjectBar projectId={id} title={model.project.title} current="export" />
      <ExportView model={model} />
    </>
  );
}

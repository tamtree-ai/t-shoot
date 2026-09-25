import { notFound } from "next/navigation";

import { StepNav } from "@/components/StepNav";
import { getProjectWithScenes } from "@/services/projects";

/**
 * A placeholder until F3 builds the real Edit screen (`Studio.dc.html`). F2's engine
 * (the worker, dispatcher and state machine) isn't built yet either, so nothing here is
 * actually filming — Approve just gets a project this far and stops.
 */
export default async function EditPage({ params }: PageProps<"/p/[id]/edit">) {
  const { id } = await params;
  const data = await getProjectWithScenes(id);
  if (!data) notFound();
  const { project, scenes } = data;

  return (
    <>
      <header className="flex h-[52px] shrink-0 items-center gap-4 border-b border-rule bg-panel px-4">
        <div className="flex w-[440px] items-center gap-2.5">
          <span aria-hidden className="size-4 rounded bg-accent" />
          <span className="text-sm font-semibold tracking-tight">Studio</span>
          <span className="text-[#3a3a42]">/</span>
          <span className="font-display text-lg text-fg italic">{project.title}</span>
        </div>
        <StepNav current="edit" reachable={["brief", "script", "edit"]} projectId={project.id} />
        <div className="w-[440px]" />
      </header>

      <main className="flex flex-1 items-center justify-center px-4">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <h1 className="font-display text-[32px] leading-tight">Filming starts here</h1>
          <p className="text-sm leading-relaxed text-fg-muted">
            The script is approved. The scene-by-scene filming engine (the worker, live states and the timeline) is next —
            Track F2. {scenes.length} scenes are queued.
          </p>
        </div>
      </main>
    </>
  );
}

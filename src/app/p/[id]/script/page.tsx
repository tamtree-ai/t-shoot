import Link from "next/link";
import { notFound } from "next/navigation";

import { StepNav } from "@/components/StepNav";
import { estimateFilming } from "@/lib/estimate";
import { estimateNarrationSeconds } from "@/lib/narration";
import { voiceLabel } from "@/lib/brief-options";
import type { Brief } from "@/lib/tamtree/stage-flows";
import { getProjectWithScenes } from "@/services/projects";
import { EstimateAside } from "./EstimateAside";
import { Screenplay } from "./Screenplay";

export default async function ScriptPage({ params }: PageProps<"/p/[id]/script">) {
  const { id } = await params;
  const data = await getProjectWithScenes(id);
  if (!data) notFound();
  const { project, scenes } = data;
  const brief = project.brief as Brief;

  const estimate = estimateFilming(scenes.map(() => ({ reused: false })));
  const totalSeconds = Math.round(scenes.reduce((sum, s) => sum + estimateNarrationSeconds(s.narration), 0));
  const changedScenes = scenes.filter((s) => s.revisionNote);
  const lastChange =
    changedScenes.length > 0
      ? {
          note: changedScenes[0].revisionNote!,
          positions: changedScenes.map((s) => s.position),
        }
      : null;

  return (
    <>
      <header className="flex h-[60px] shrink-0 items-center gap-4 border-b border-rule-2 bg-panel px-5">
        <div className="flex w-[420px] items-center gap-2.5">
          <div className="flex size-[22px] items-center justify-center rounded-md border border-line bg-raised-2">
            <span className="size-2 rounded-full bg-accent" />
          </div>
          <span className="text-[15px] font-semibold tracking-[-0.01em]">Studio</span>
          <span className="text-lg text-[#3a3a42]">/</span>
          <Link href="/" className="text-[13px] text-fg-3">
            Projects
          </Link>
          <span className="text-lg text-[#3a3a42]">/</span>
          <span className="font-display text-[22px] text-fg italic">{project.title}</span>
        </div>
        <StepNav current="script" reachable={["brief", "script"]} projectId={project.id} />
        <div className="flex w-[420px] items-center justify-end gap-2.5">
          <span className="flex items-center gap-1.5 text-xs text-fg-muted">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#85858f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            Saved
          </span>
          <div aria-label="Dilhan A." className="ml-1 flex size-[30px] items-center justify-center rounded-full bg-[#26262b] text-[11px] font-semibold text-fg-2">
            DA
          </div>
        </div>
      </header>

      <div className="flex flex-1 bg-canvas-script">
        <Screenplay projectId={project.id} scenes={scenes} voiceLabel={voiceLabel(brief.voice)} totalSeconds={totalSeconds} />
        <EstimateAside projectId={project.id} estimate={estimate} limitUsd={project.limitUsd} lastChange={lastChange} />
      </div>
    </>
  );
}

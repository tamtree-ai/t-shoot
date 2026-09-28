import { MemberMark } from "@/components/MemberMark";
import { PageHeader } from "@/components/PageHeader";
import { StepNav } from "@/components/StepNav";
import { getCurrentMember } from "@/lib/auth";
import type { Project } from "@/db/schema";
import { estimateNarrationSeconds } from "@/lib/narration";
import type { Brief } from "@/lib/tamtree/stage-flows";
import { getActiveScenes } from "@/services/projects";
import { aiClips } from "@/types/ai-clips";
import { voiceLabel } from "@/types/ai-clips/catalog";
import { EstimateAside } from "./EstimateAside";
import { Screenplay } from "./Screenplay";
import { displayTitle } from "@/lib/display-title";

/** Script (03 §1.2, `Script.dc.html`): the `ai_clips` draft screen and its human gate. */
export async function AiClipsScript({ project }: { project: Project }) {
  const scenes = await getActiveScenes(project.id);
  const brief = project.brief as Brief;
  const member = await getCurrentMember();

  const estimate = aiClips.estimate(scenes.map((s) => ({ narration: s.narration, visual_prompt: s.visualPrompt })));
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
      <PageHeader
        trail={[{ href: "/", label: "Projects" }, { label: displayTitle(project.title), display: true }]}
        center={<StepNav current="script" reachable={["brief", "script"]} projectId={project.id} steps={aiClips.steps} />}
        trailing={
          <>
            <span className="flex items-center gap-1.5 text-xs text-fg-muted">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#85858f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
              Saved
            </span>
            <MemberMark name={member.name} email={member.email} />
          </>
        }
      />

      <div className="flex flex-1 bg-canvas-script">
        <Screenplay projectId={project.id} scenes={scenes} voiceLabel={voiceLabel(brief.voice)} totalSeconds={totalSeconds} />
        <EstimateAside projectId={project.id} estimate={estimate} limitUsd={project.limitUsd} lastChange={lastChange} />
      </div>
    </>
  );
}

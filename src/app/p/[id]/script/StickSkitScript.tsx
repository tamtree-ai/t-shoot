import Link from "next/link";

import { StepNav } from "@/components/StepNav";
import type { Project } from "@/db/schema";
import { Skit } from "@/lib/tamtree/stage-flows";
import { getSkitDraft } from "@/services/skit";
import { stickSkit } from "@/types/stick-skit";
import { SkitReview } from "./SkitReview";
import { WriteSkit } from "./WriteSkit";

/**
 * The `stick_skit` script step (09 §6 steps 3–4): writing the skit if the brief's run didn't,
 * then the review — beats editor, self-check, silent preview, Ask for a change, and the gate.
 */
export async function StickSkitScript({ project }: { project: Project }) {
  const brief = stickSkit.configSchema.parse(project.brief);
  const draft = await getSkitDraft(project.id);

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
        <StepNav current="script" reachable={["brief", "script"]} projectId={project.id} steps={stickSkit.steps} />
        <div className="flex w-[420px] justify-end">
          <div aria-label="Dilhan A." className="flex size-[30px] items-center justify-center rounded-full bg-[#26262b] text-[11px] font-semibold text-fg-2">
            DA
          </div>
        </div>
      </header>

      {draft ? (
        <SkitReview
          // A new draft from the server (written, revised, undone) restarts the editor; the
          // owner's own saves don't re-render the page, so typing is never interrupted.
          key={draft.digest}
          projectId={project.id}
          topic={brief.topic}
          skit={Skit.parse(draft.skit)}
          limitUsd={project.limitUsd}
          catalogVersion={draft.catalogVersion}
          revisionNote={draft.previousSkit ? draft.revisionNote : null}
        />
      ) : (
        <WriteSkit projectId={project.id} topic={brief.topic} />
      )}
    </>
  );
}

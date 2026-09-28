import { MemberMark } from "@/components/MemberMark";
import { PageHeader } from "@/components/PageHeader";
import { StepNav } from "@/components/StepNav";
import { getCurrentMember } from "@/lib/auth";
import type { Project } from "@/db/schema";
import { Skit } from "@/lib/tamtree/stage-flows";
import { getProjectComment } from "@/services/review";
import { fontFamily } from "@/lib/brand";
import { getProduceState, getSkitDraft } from "@/services/skit";
import { getShow } from "@/services/shows";
import { getTypeDefaults } from "@/services/type-settings";
import { aspectOfBrief, aspectOfSkit } from "@/lib/stick/frame";
import { stickCatalog } from "@/lib/stick/registry";
import { stickSkit } from "@/types/stick-skit";
import { setAspect, setLabel } from "@/types/stick-skit/catalog";
import { SkitReview } from "./SkitReview";
import { WriteSkit } from "./WriteSkit";
import { displayTitle } from "@/lib/display-title";

/**
 * The `stick_skit` script step (09 §6 steps 3–4): writing the skit if the brief's run didn't,
 * then the review — beats editor, self-check, silent preview, Ask for a change, and the gate.
 */
export async function StickSkitScript({ project, changeFromComment }: { project: Project; changeFromComment?: string }) {
  const brief = stickSkit.configSchema.parse(project.brief);
  const defaults = await getTypeDefaults(project.orgId, stickSkit.kind);
  const comment = changeFromComment ? await getProjectComment(project.id, changeFromComment) : null;
  const draft = await getSkitDraft(project.id);
  const produce = await getProduceState(project.id, draft);
  const made = produce?.versionNumber != null;
  const frame = aspectOfSkit(draft?.skit, aspectOfBrief(brief));
  const setIds = brief.allowed_sets?.length ? brief.allowed_sets : stickCatalog.sets.map((s) => s.id);
  const setOptions = setIds
    .filter((id) => stickCatalog.sets.some((s) => s.id === id) && setAspect(id) === frame)
    .map((id) => ({ id, label: setLabel(id) }));
  const show = project.showId ? await getShow(project.orgId, project.showId) : null;
  const brand = show?.config.brand;
  const member = await getCurrentMember();

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <PageHeader
        trail={[{ href: "/", label: "Projects" }, { label: displayTitle(project.title), display: true }]}
        center={
          <StepNav
            current="script"
            reachable={made ? ["brief", "script", "review", "export"] : ["brief", "script"]}
            projectId={project.id}
            steps={stickSkit.steps}
          />
        }
        trailing={<MemberMark name={member.name} email={member.email} />}
      />

      {draft ? (
        <SkitReview
          // A new draft from the server (written, revised, undone) restarts the editor; the
          // owner's own saves don't re-render the page, so typing is never interrupted.
          key={draft.digest}
          projectId={project.id}
          topic={brief.topic}
          skit={Skit.parse(draft.skit)}
          limitUsd={project.limitUsd}
          warnings={draft.warnings}
          voices={defaults.voice_map}
          targetS={brief.target_s}
          revisionNote={draft.previousSkit ? draft.revisionNote : null}
          produce={produce}
          fromComment={comment && !comment.resolved && changeFromComment ? { id: changeFromComment, note: `${comment.authorName} said: “${comment.body}”` } : null}
          setOptions={setOptions}
          shape={frame}
          focusFraction={comment && !comment.resolved && changeFromComment ? comment.fraction : null}
          origin={project.origin}
          musicBed={project.musicBed}
          musicVolume={project.musicVolume}
          previewFont={brand ? fontFamily(brand.font) : undefined}
          brand={brand}
        />
      ) : (
        <WriteSkit projectId={project.id} topic={brief.topic} />
      )}
    </div>
  );
}

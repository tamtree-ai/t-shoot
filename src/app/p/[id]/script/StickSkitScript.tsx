import Link from "next/link";

import { CharacterThumb, SetThumb } from "@/components/stick-skit/Thumbs";
import { StepNav } from "@/components/StepNav";
import type { Project } from "@/db/schema";
import type { StickBrief } from "@/lib/tamtree/stage-flows";
import { stickSkit } from "@/types/stick-skit";
import { characterName, setLabel } from "@/types/stick-skit/catalog";

const label = "text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase";

/**
 * The `stick_skit` script step. K2 stops at the saved brief (catalog pinned, nothing spent);
 * K3 replaces this with the skit review: writing it, the beats editor, preview and Approve.
 */
export function StickSkitScript({ project }: { project: Project }) {
  const brief = stickSkit.configSchema.parse(project.brief) satisfies StickBrief;

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

      <main className="flex flex-1 justify-center bg-canvas-script px-4">
        <div className="flex w-[760px] flex-col gap-6 py-12">
          <h1 className="font-display text-[40px] leading-[1.05] tracking-[-0.01em]">{brief.topic}</h1>
          {brief.description && <p className="text-[15px] leading-relaxed text-fg-2">{brief.description}</p>}

          <dl className="grid grid-cols-3 gap-6">
            <div className="flex flex-col gap-2">
              <dt className={label}>Format</dt>
              <dd className="text-sm">{brief.template ?? "Writer’s pick"}</dd>
            </div>
            <div className="flex flex-col gap-2">
              <dt className={label}>Tone</dt>
              <dd className="text-sm capitalize">{brief.tone ?? "Any"}</dd>
            </div>
            <div className="flex flex-col gap-2">
              <dt className={label}>Catalog</dt>
              <dd className="font-mono text-xs text-fg-2">{project.catalogVersion}</dd>
            </div>
          </dl>

          <div className="flex gap-2">
            {brief.cast.map((c) => (
              <figure key={c.id} className="relative aspect-[9/16] w-28 overflow-hidden rounded-[10px] border border-rule bg-[#0c0c0f]">
                <CharacterThumb id={c.character} className="absolute inset-0" />
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2.5 pt-6 pb-2 text-xs font-medium text-white">
                  {characterName(c.character)}
                  {c.label && <span className="text-white/70"> · {c.label}</span>}
                </figcaption>
              </figure>
            ))}
            {brief.set && (
              <figure className="relative aspect-[9/16] w-28 overflow-hidden rounded-[10px] border border-rule bg-[#0c0c0f]">
                <SetThumb id={brief.set} className="absolute inset-0" />
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2.5 pt-6 pb-2 text-xs font-medium text-white">{setLabel(brief.set)}</figcaption>
              </figure>
            )}
          </div>

          <p role="status" className="rounded-[10px] border border-rule bg-panel px-4 py-3 text-sm text-fg-2">
            Brief saved. Nothing has been spent. Writing the skit from it isn&rsquo;t wired up yet.
          </p>
        </div>
      </main>
    </>
  );
}

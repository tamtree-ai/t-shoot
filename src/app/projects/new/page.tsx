import Link from "next/link";

import { StepNav } from "@/components/StepNav";
import { CharacterThumb } from "@/components/stick-skit/Thumbs";
import { getCurrentMember } from "@/lib/auth";
import { listCharacters } from "@/services/cast";
import { getShow, nextEpisodeNumber } from "@/services/shows";
import { getTypeDefaults } from "@/services/type-settings";
import { productionType } from "@/types/registry";
import type { StickSkitDefaults } from "@/types/stick-skit";
import { PRODUCTION_KINDS, type ProductionKind } from "@/types/types";
import { typeUi } from "@/types/ui";
import { StudioMark } from "@/components/StudioMark";
import { StickBriefForm } from "./StickBriefForm";

export const dynamic = "force-dynamic";

/**
 * New project: pick a type (09 §6.1), then its Brief (03 §1.1, `Brief.dc.html`) — a single
 * column, one CTA, no paid call.
 */
export default async function NewProjectPage({ searchParams }: PageProps<"/projects/new">) {
  const { type, show } = await searchParams;
  const kind = PRODUCTION_KINDS.find((k) => k === type);
  if (!kind) return <TypePicker />;

  const member = await getCurrentMember();
  const defaults = await getTypeDefaults(member.orgId, kind);
  const { BriefForm } = typeUi(kind);
  const showRow = kind === "stick_skit" && typeof show === "string" ? await getShow(member.orgId, show) : null;
  const saved = kind === "stick_skit" ? await listCharacters(member.orgId) : [];
  const episodeNumber = showRow ? await nextEpisodeNumber(showRow.id) : undefined;
  return (
    <>
      <header className="flex h-[52px] shrink-0 items-center gap-4 border-b border-rule bg-panel px-4">
        <div className="flex w-[440px] items-center gap-2.5">
          <StudioMark />
          <span className="text-[#3a3a42]">/</span>
          <Link href="/" className="text-[13px] text-fg-3">
            Projects
          </Link>
          <span className="text-[#3a3a42]">/</span>
          <span className="text-[13px] text-fg">New short</span>
        </div>
        <StepNav current="brief" reachable={["brief"]} steps={productionType(kind).steps} />
        <div className="flex w-[440px] justify-end">
          <div aria-label="Dilhan A." className="flex size-7 items-center justify-center rounded-full bg-[#26262b] text-[11px] font-semibold text-fg-2">
            DA
          </div>
        </div>
      </header>

      <main className="flex flex-1 justify-center bg-[radial-gradient(circle_at_50%_0%,#15151a_0%,var(--color-canvas)_60%)] px-4">
        {kind === "stick_skit" ? (
          <StickBriefForm
            defaults={defaults as StickSkitDefaults}
            saved={saved}
            showId={showRow?.id}
            episodeNumber={episodeNumber}
            initial={showRow ? {
              template: (showRow.config.template as "exchange" | undefined) ?? null,
              cast: showRow.config.cast.map((c) => c.character),
              set: showRow.config.set,
              tone: showRow.config.tone ? showRow.config.tone[0]!.toUpperCase() + showRow.config.tone.slice(1) : null,
              aspect: showRow.config.aspect,
            } : undefined}
          />
        ) : (
          <BriefForm defaults={defaults} />
        )}
      </main>
    </>
  );
}

const TYPE_COPY: Record<ProductionKind, { blurb: string; price: string }> = {
  ai_clips: { blurb: "Film a short. The price is shown before you start.", price: "a few dollars" },
  stick_skit: { blurb: "Voice a joke.", price: "about a cent" },
};

function TypePicker() {
  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <div className="flex w-[760px] flex-col gap-6">
        <h1 className="font-display text-[40px] leading-[1.05] tracking-[-0.01em]">What are you making?</h1>
        <div className="grid grid-cols-2 gap-3">
          {PRODUCTION_KINDS.map((kind: ProductionKind) => (
            <Link
              key={kind}
              href={`/projects/new?type=${kind}`}
              className="flex flex-col overflow-hidden rounded-[14px] border border-rule bg-panel hover:border-accent"
            >
              <span className="relative h-40 bg-[#101014]">
                {kind === "stick_skit" ? (
                  <CharacterThumb id="milo" className="absolute inset-0" />
                ) : (
                  <span className="absolute inset-6 flex items-end text-[15px] font-semibold leading-snug text-white">A captioned frame, 9:16.</span>
                )}
              </span>
              <span className="flex flex-col gap-1 p-5">
                <span className="text-[17px] font-semibold">{productionType(kind).label}</span>
                <span className="text-[13px] text-fg-muted">
                  {TYPE_COPY[kind].blurb} {TYPE_COPY[kind].price}.
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

import Link from "next/link";

import { StepNav } from "@/components/StepNav";
import { getCurrentMember } from "@/lib/auth";
import { getTypeDefaults } from "@/services/type-settings";
import { productionType } from "@/types/registry";
import { PRODUCTION_KINDS, type ProductionKind } from "@/types/types";
import { typeUi } from "@/types/ui";
import { StudioMark } from "@/components/StudioMark";

export const dynamic = "force-dynamic";

/**
 * New project: pick a type (09 §6.1), then its Brief (03 §1.1, `Brief.dc.html`) — a single
 * column, one CTA, no paid call.
 */
export default async function NewProjectPage({ searchParams }: PageProps<"/projects/new">) {
  const { type } = await searchParams;
  const kind = PRODUCTION_KINDS.find((k) => k === type);
  if (!kind) return <TypePicker />;

  const member = await getCurrentMember();
  const defaults = await getTypeDefaults(member.orgId, kind);
  const { BriefForm } = typeUi(kind);
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
        <BriefForm defaults={defaults} />
      </main>
    </>
  );
}

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
              className="flex h-32 items-end rounded-[14px] border border-rule bg-panel p-5 text-[17px] font-semibold hover:border-accent"
            >
              {productionType(kind).label}
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

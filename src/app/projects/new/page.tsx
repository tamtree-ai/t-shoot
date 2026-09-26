import Link from "next/link";

import { StepNav } from "@/components/StepNav";
import { typeUi } from "@/types/ui";

/**
 * Brief (03 §1.1, `Brief.dc.html`): a single column, one CTA, no paid call. Every new
 * project is `ai_clips` until the type picker lands (T3).
 */
export default function NewProjectPage() {
  const { BriefForm } = typeUi("ai_clips");
  return (
    <>
      <header className="flex h-[52px] shrink-0 items-center gap-4 border-b border-rule bg-panel px-4">
        <div className="flex w-[440px] items-center gap-2.5">
          <span aria-hidden className="size-4 rounded bg-accent" />
          <span className="text-sm font-semibold tracking-tight">Studio</span>
          <span className="text-[#3a3a42]">/</span>
          <Link href="/" className="text-[13px] text-fg-3">
            Projects
          </Link>
          <span className="text-[#3a3a42]">/</span>
          <span className="text-[13px] text-fg">New short</span>
        </div>
        <StepNav current="brief" reachable={["brief"]} />
        <div className="flex w-[440px] justify-end">
          <div aria-label="Dilhan A." className="flex size-7 items-center justify-center rounded-full bg-[#26262b] text-[11px] font-semibold text-fg-2">
            DA
          </div>
        </div>
      </header>

      <main className="flex flex-1 justify-center bg-[radial-gradient(circle_at_50%_0%,#15151a_0%,var(--color-canvas)_60%)] px-4">
        <BriefForm />
      </main>
    </>
  );
}

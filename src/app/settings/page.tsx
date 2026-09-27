import Link from "next/link";

import { getCurrentMember } from "@/lib/auth";
import { getTypeDefaults } from "@/services/type-settings";
import { productionType } from "@/types/registry";
import { PRODUCTION_KINDS } from "@/types/types";
import { typeUi } from "@/types/ui";
import { StudioMark } from "@/components/StudioMark";

export const dynamic = "force-dynamic";

/** Workspace settings: one section per production type, what this client allows (08, decision 4). */
export default async function SettingsPage() {
  const member = await getCurrentMember();
  const sections = await Promise.all(
    PRODUCTION_KINDS.map(async (kind) => ({ kind, defaults: await getTypeDefaults(member.orgId, kind) })),
  );

  return (
    <>
      <header className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-rule bg-panel px-4">
        <StudioMark />
        <span className="text-[#3a3a42]">/</span>
        <Link href="/" className="text-[13px] text-fg-3">
          Projects
        </Link>
        <span className="text-[#3a3a42]">/</span>
        <span className="text-[13px] text-fg">Settings</span>
      </header>

      <main className="flex flex-1 justify-center px-4">
        <div className="flex w-[760px] flex-col gap-10 py-12">
          <h1 className="font-display text-[40px] leading-[1.05] tracking-[-0.01em]">Settings</h1>
          {sections.map(({ kind, defaults }) => {
            const { SettingsForm } = typeUi(kind);
            return (
              <section key={kind} aria-labelledby={`settings-${kind}`} className="flex flex-col gap-5 rounded-[14px] border border-rule bg-panel p-6">
                <h2 id={`settings-${kind}`} className="text-[17px] font-semibold tracking-[-0.01em]">
                  {productionType(kind).label}
                </h2>
                <SettingsForm defaults={defaults} canEdit={member.role === "owner"} />
              </section>
            );
          })}
        </div>
      </main>
    </>
  );
}

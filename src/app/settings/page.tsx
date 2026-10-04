import Link from "next/link";

import { getCurrentMember } from "@/lib/auth";
import { listCharacters } from "@/services/cast";
import { getTypeDefaults } from "@/services/type-settings";
import { getOrg, memberById } from "@/services/workspace";
import { WorkspacePanel } from "./WorkspacePanel";
import { productionType } from "@/types/registry";
import { PRODUCTION_KINDS } from "@/types/types";
import { typeUi } from "@/types/ui";
import { isStandalone } from "@/lib/standalone";
import { StudioMark } from "@/components/StudioMark";

export const dynamic = "force-dynamic";

/** Workspace settings: one section per production type, what this client allows (08, decision 4). */
export default async function SettingsPage() {
  const member = await getCurrentMember();
  if (member.role === "client") {
    return (
      <main className="flex flex-1 items-center justify-center px-4">
        <p className="text-[14px] text-fg-muted">Settings stay with the workspace owner.</p>
      </main>
    );
  }
  const [row, org, characters] = await Promise.all([memberById(member.memberId), getOrg(member.orgId), listCharacters(member.orgId)]);
  const sections = await Promise.all(
    // Standalone mode makes stick skits only, so AI clips have no settings to show.
    PRODUCTION_KINDS.filter((kind) => !isStandalone() || kind === "stick_skit").map(async (kind) => ({ kind, defaults: await getTypeDefaults(member.orgId, kind) })),
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
          {row && (
            <WorkspacePanel
              role={member.role}
              slack={org?.slackWebhook ?? ""}
              characters={characters}
              consent={row.voiceCloneConsent}
              prefs={{
                notifyComment: row.notifyComment,
                notifyApproved: row.notifyApproved,
                notifyFilm: row.notifyFilm,
                notifyLive: row.notifyLive,
                notifySlack: row.notifySlack,
              }}
            />
          )}
          {sections.map(({ kind, defaults }) => {
            const { SettingsForm } = typeUi(kind);
            return (
              <section key={kind} aria-labelledby={`settings-${kind}`} className="flex flex-col gap-5 rounded-[14px] border border-rule bg-panel p-6">
                <h2 id={`settings-${kind}`} className="text-[17px] font-semibold tracking-[-0.01em]">
                  {productionType(kind).label}
                </h2>
                <SettingsForm defaults={defaults} canEdit={member.role === "owner"} standalone={isStandalone()} />
              </section>
            );
          })}
        </div>
      </main>
    </>
  );
}

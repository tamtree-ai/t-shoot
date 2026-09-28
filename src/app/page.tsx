import Link from "next/link";

import { MemberMark } from "@/components/MemberMark";
import { PageHeader } from "@/components/PageHeader";
import { ProjectLibrary } from "@/components/ProjectLibrary";
import { TamtreeStatus } from "@/components/TamtreeStatus";
import { signOutAction } from "@/app/horizon-actions";
import { getCurrentMember } from "@/lib/auth";
import { unreadCount } from "@/services/workspace";
import { getTamtreeConnection } from "@/lib/tamtree";
import { listLibrary } from "@/services/library";
import { listShows, variationPriceUsd } from "@/services/shows";
import type { ProjectStep } from "@/types/types";

export const dynamic = "force-dynamic";

const STEP_LABEL: Record<ProjectStep, string> = {
  brief: "Brief",
  script: "Script",
  edit: "Edit",
  review: "Review",
  export: "Export",
};

/**
 * The projects home (03 §1): every project in the org, the most recently touched first,
 * each opening on the step it has reached. An org with none gets the one call to action.
 */
export default async function Home() {
  const [connection, member] = await Promise.all([getTamtreeConnection(), getCurrentMember()]);
  const unread = await unreadCount(member.memberId);
  const [projects, shows] = await Promise.all([
    listLibrary(member.orgId, (step, steps) => STEP_LABEL[openStep(step as ProjectStep, steps as readonly ProjectStep[])]),
    listShows(member.orgId),
  ]);
  return (
    <>
      <PageHeader
        trail={[{ label: "Projects" }]}
        trailing={
          <>
            <TamtreeStatus connection={connection} />
            <nav aria-label="Workspace" className="flex items-center gap-0.5 text-[13px]">
              <HeaderLink href="/guide">Guide</HeaderLink>
              <HeaderLink href="/portal">Reviews{unread > 0 ? ` · ${unread}` : ""}</HeaderLink>
              <HeaderLink href="/settings">Settings</HeaderLink>
              <HeaderLink href="/sign-in">Sign in</HeaderLink>
              <form action={signOutAction}>
                <button type="submit" className="rounded-md px-2 py-1 text-fg-3 hover:bg-hover hover:text-fg">
                  Sign out
                </button>
              </form>
            </nav>
            <MemberMark name={member.name} email={member.email} />
          </>
        }
      />

      {projects.length === 0 ? (
        <main className="flex flex-1 items-center justify-center bg-[radial-gradient(circle_at_50%_0%,#15151a_0%,var(--color-canvas)_60%)] px-4">
          <div className="flex max-w-md flex-col items-center gap-5 text-center">
            <h1 className="font-display text-[40px] leading-none">Make your first short</h1>
            <p className="text-sm leading-relaxed text-fg-muted">
              Write what it&rsquo;s about, approve the script, and watch each scene arrive. You&rsquo;ll see
              what filming costs before anything is spent.
            </p>
            <NewShort />
          </div>
        </main>
      ) : (
        <main className="flex-1 bg-canvas px-4 py-10">
          <ProjectLibrary projects={projects} shows={shows} variationPrice={variationPriceUsd()} memberId={member.memberId} />
        </main>
      )}
    </>
  );
}

function HeaderLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded-md px-2 py-1 text-fg-3 hover:bg-hover hover:text-fg">
      {children}
    </Link>
  );
}

function NewShort() {
  return (
    <Link
      href="/projects/new"
      className="flex h-11 shrink-0 items-center rounded-md bg-accent px-5 text-[15px] font-semibold text-accent-ink"
    >
      New short
    </Link>
  );
}

/** The step a project opens on: where it has got to. Once a project exists, `brief` has no screen. */
function openStep(step: ProjectStep, steps: readonly ProjectStep[]): ProjectStep {
  return step !== "brief" && steps.includes(step) ? step : "script";
}

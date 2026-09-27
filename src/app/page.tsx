import Link from "next/link";

import { StudioMark } from "@/components/StudioMark";
import { TamtreeStatus } from "@/components/TamtreeStatus";
import { getCurrentMember } from "@/lib/auth";
import { getTamtreeConnection } from "@/lib/tamtree";
import { listProjects } from "@/services/projects";
import { productionType } from "@/types/registry";
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
  const projects = await listProjects(member.orgId);
  return (
    <>
      <header className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-rule bg-panel px-4">
        <StudioMark />
        <span className="text-[#3a3a42]">/</span>
        <span className="text-[13px] text-fg-3">Projects</span>
        <span className="ml-auto" />
        <TamtreeStatus connection={connection} />
        <Link href="/settings" className="ml-2 text-[13px] text-fg-3 hover:text-fg">
          Settings
        </Link>
      </header>

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
          <div className="mx-auto flex max-w-3xl flex-col gap-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h1 className="font-display text-[40px] leading-none">Projects</h1>
                <p className="mt-2 text-[13px] text-fg-muted">
                  {projects.length} {projects.length === 1 ? "short" : "shorts"}
                </p>
              </div>
              <NewShort />
            </div>
            <ul className="overflow-hidden rounded-lg border border-rule-2 bg-panel">
              {projects.map((p) => {
                const type = productionType(p.kind);
                const step = openStep(p.step, type.steps);
                return (
                  <li key={p.id} className="border-b border-rule-2 last:border-b-0">
                    <Link href={`/p/${p.id}/${step}`} className="flex items-center gap-4 px-4 py-3.5 hover:bg-hover">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-xl text-fg italic">{p.title}</span>
                        <span className="mt-0.5 block text-xs text-fg-muted">{type.label}</span>
                      </span>
                      <span className="w-16 shrink-0 text-[13px] text-fg-2">{STEP_LABEL[step]}</span>
                      <time
                        dateTime={p.updatedAt.toISOString()}
                        title={p.updatedAt.toLocaleString("en-AU")}
                        className="num w-24 shrink-0 text-right text-xs text-fg-muted"
                      >
                        {ago(p.updatedAt)}
                      </time>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </main>
      )}
    </>
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

function ago(when: Date): string {
  const s = Math.max(0, Math.round((Date.now() - when.getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)} d ago`;
  return when.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

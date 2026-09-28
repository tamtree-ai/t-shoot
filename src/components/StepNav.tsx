import Link from "next/link";

import type { ProjectStep } from "@/types/types";

/** The five-step project nav shared by Brief, Script and the later screens (03 §1). */
const STEPS = [
  { key: "brief", label: "Brief" },
  { key: "script", label: "Script" },
  { key: "edit", label: "Edit" },
  { key: "review", label: "Review" },
  { key: "export", label: "Export" },
] as const;

export type StepKey = ProjectStep;

/**
 * A step is reachable once its project has gone at least that far. `steps` is the
 * project type's own subset (all five until a type is chosen).
 */
export function StepNav({
  current,
  reachable,
  projectId,
  steps,
}: {
  current: StepKey;
  reachable: StepKey[];
  projectId?: string;
  steps?: readonly StepKey[];
}) {
  const pool = steps ? STEPS.filter((s) => steps.includes(s.key)) : [...STEPS];
  // Once a project exists, Brief has no screen. The topic lives on the script.
  const shown = projectId ? pool.filter((s) => s.key !== "brief") : pool;
  const currentIndex = shown.findIndex((s) => s.key === current);
  return (
    <nav
      aria-label="Project steps"
      className="flex h-full items-center justify-center gap-1"
    >
      {shown.map((step, i) => {
        const isCurrent = step.key === current;
        const isDone = i < currentIndex && reachable.includes(step.key);
        const href = projectId && reachable.includes(step.key) ? `/p/${projectId}/${step.key}` : undefined;
        const content = (
          <>
            {isDone ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6fcf97" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            ) : (
              <span className={`font-mono text-[11px] ${isCurrent ? "text-accent" : "text-fg-muted"}`}>{String(i + 1).padStart(2, "0")}</span>
            )}
            {step.label}
          </>
        );
        const className = `flex h-full items-center gap-1.5 px-3 text-[13px] box-border ${
          isCurrent ? "font-medium text-fg border-b-2 border-accent" : "text-fg-3 max-sm:hidden"
        }`;
        return href ? (
          <Link key={step.key} href={href} aria-current={isCurrent ? "page" : undefined} className={className}>
            {content}
          </Link>
        ) : (
          <span key={step.key} aria-current={isCurrent ? "page" : undefined} className={className}>
            {content}
          </span>
        );
      })}
    </nav>
  );
}

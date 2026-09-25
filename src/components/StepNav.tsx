import Link from "next/link";

/** The five-step project nav shared by Brief, Script and the later screens (03 §1). */
const STEPS = [
  { key: "brief", code: "01", label: "Brief" },
  { key: "script", code: "02", label: "Script" },
  { key: "edit", code: "03", label: "Edit" },
  { key: "review", code: "04", label: "Review" },
  { key: "export", code: "05", label: "Export" },
] as const;

export type StepKey = (typeof STEPS)[number]["key"];

/** A step is reachable once its project has gone at least that far. */
export function StepNav({ current, reachable, projectId }: { current: StepKey; reachable: StepKey[]; projectId?: string }) {
  const currentIndex = STEPS.findIndex((s) => s.key === current);
  return (
    <nav
      aria-label="Project steps"
      className="flex h-full flex-grow items-center justify-center gap-1"
    >
      {STEPS.map((step, i) => {
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
              <span className={`font-mono text-[11px] ${isCurrent ? "text-accent" : "text-fg-muted"}`}>{step.code}</span>
            )}
            {step.label}
          </>
        );
        const className = `flex h-full items-center gap-1.5 px-3 text-[13px] box-border ${
          isCurrent ? "font-medium text-fg border-b-2 border-accent" : "text-fg-3"
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

import { StepNav, type StepKey } from "./StepNav";
import { StudioMark } from "./StudioMark";

/** The slim top bar for the Review and Export screens (the Edit screen has its own, with the spend pill). */
export function ProjectBar({
  projectId,
  title,
  current,
  right,
  steps,
}: {
  projectId: string;
  title: string;
  current: StepKey;
  right?: React.ReactNode;
  /** The project type's steps; every step when omitted. */
  steps?: readonly StepKey[];
}) {
  return (
    <header className="flex h-[52px] shrink-0 items-center gap-4 border-b border-rule bg-panel px-4">
      <div className="flex w-[440px] items-center gap-2.5">
        <StudioMark />
        <span className="text-[#3a3a42]">/</span>
        <span className="font-display text-xl text-fg italic">{title}</span>
      </div>
      <StepNav current={current} reachable={["brief", "script", "edit", "review", "export"]} projectId={projectId} steps={steps} />
      <div className="flex w-[440px] items-center justify-end gap-2.5">{right}</div>
    </header>
  );
}

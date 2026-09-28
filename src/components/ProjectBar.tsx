import { displayTitle } from "@/lib/display-title";
import { PageHeader } from "./PageHeader";
import { StepNav, type StepKey } from "./StepNav";

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
    <PageHeader
      trail={[{ label: displayTitle(title), display: true }]}
      center={<StepNav current={current} reachable={["brief", "script", "edit", "review", "export"]} projectId={projectId} steps={steps} />}
      trailing={right}
    />
  );
}

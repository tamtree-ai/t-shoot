/**
 * The state machine and wording map (03-experience §3, 02-architecture §4): Tamtree's
 * run statuses and error codes become the one vocabulary Studio shows — a dot plus a
 * word. Pure; no I/O. `RunOut.status` is a free string on /v1, so anything unknown
 * fails closed to "Working", never to Ready.
 */
import type { StageFlow } from "@/lib/tamtree/stage-flows";

export type Dot = "grey" | "accent" | "green" | "amber";

export type StudioState = {
  word: string;
  dot: Dot;
  /** The filming dot is the only looping animation in the app. */
  animated?: boolean;
  /** Amber states carry an icon so colour is never the only signal. */
  triangle?: boolean;
};

export type RunFacts = {
  stage: StageFlow;
  /** Raw Tamtree status string, or "pending" before the run is triggered. */
  status: string;
  reused?: boolean;
  error?: { code: string; message: string } | null;
  costUsd?: string | number | null;
  meteredSteps?: number | null;
  /** True once the output has been read and validated (A2). */
  hasOutput?: boolean;
};

const RUNNING_WORD: Record<StageFlow, string> = {
  "studio-script": "Writing",
  "studio-narrate": "Recording voice",
  "studio-clip": "Filming",
  "studio-render": "Rendering",
  "stick-script": "Writing",
  "stick-produce": "Making the video",
};

export function studioState(f: RunFacts): StudioState {
  switch (f.status) {
    case "pending":
    case "queued":
      return { word: "Queued", dot: "grey" };
    case "running":
      return { word: RUNNING_WORD[f.stage], dot: "accent", animated: f.stage === "studio-clip" };
    case "completed":
      // Ready needs the output, not just the status (03 §3: "run_complete + an asset id").
      if (!f.hasOutput) return { word: "Working", dot: "accent" };
      return f.reused ? { word: "Reused · no charge", dot: "green" } : { word: "Ready", dot: "green" };
    case "failed":
      return { word: "Not filmed — try again", dot: "amber", triangle: true };
    case "cancelled":
      return { word: "Stopped", dot: "grey" };
    default:
      return { word: "Working", dot: "accent" };
  }
}

export type FailureNotice = {
  message: string;
  /** What the user can do next. `raise-limit` is shown to owners only. */
  action: "try-again" | "ask-for-change" | "raise-limit";
};

/** True only when the cost is zero *and* the step was metered (OD-9); otherwise say nothing. */
export function provablyNotCharged(f: Pick<RunFacts, "costUsd" | "meteredSteps">): boolean {
  return Number(f.costUsd ?? NaN) === 0 && (f.meteredSteps ?? 0) > 0;
}

export function failureNotice(
  f: Pick<RunFacts, "error" | "costUsd" | "meteredSteps">,
  limitUsd?: string,
): FailureNotice {
  const charged = provablyNotCharged(f) ? " You weren't charged." : "";
  switch (f.error?.code) {
    case "provider_timeout":
      return { message: `The video service didn't answer in time.${charged}`, action: "try-again" };
    case "content_refused":
      return {
        message: "The video service wouldn't film this shot. Try describing it differently.",
        action: "ask-for-change",
      };
    case "spend_guard":
      return {
        message: `This would take the video past its $${Number(limitUsd ?? 0).toFixed(2)} limit.`,
        action: "raise-limit",
      };
    case "catalog_mismatch":
      return {
        message: "The characters and sets changed since this skit was written. Write it again to use the new ones.",
        action: "ask-for-change",
      };
    case "invalid_skit":
      return { message: `The video service refused this skit. Fix what the check found, then approve again.${charged}`, action: "ask-for-change" };
    default:
      return { message: `Something went wrong on our side.${charged}`, action: "try-again" };
  }
}

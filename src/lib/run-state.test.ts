import { describe, expect, it } from "vitest";

import { failureNotice, studioState } from "./run-state";

describe("studioState", () => {
  it("maps each stage's running status to its own word; only clips animate", () => {
    expect(studioState({ stage: "studio-clip", status: "running" })).toMatchObject({ word: "Filming", animated: true });
    expect(studioState({ stage: "studio-narrate", status: "running" })).toMatchObject({ word: "Recording voice" });
    expect(studioState({ stage: "studio-narrate", status: "running" }).animated).toBeFalsy();
    expect(studioState({ stage: "studio-script", status: "running" }).word).toBe("Writing");
    expect(studioState({ stage: "studio-render", status: "running" }).word).toBe("Rendering");
  });

  it("is Ready only when completed *and* the output was read", () => {
    expect(studioState({ stage: "studio-clip", status: "completed" }).dot).not.toBe("green");
    expect(studioState({ stage: "studio-clip", status: "completed", hasOutput: true })).toMatchObject({ word: "Ready", dot: "green" });
    expect(studioState({ stage: "studio-clip", status: "completed", hasOutput: true, reused: true }).word).toBe("Reused · no charge");
  });

  it("fails closed: an unknown status is Working, never Ready", () => {
    expect(studioState({ stage: "studio-clip", status: "paused-for-review" })).toMatchObject({ word: "Working" });
  });

  it("maps failed and cancelled", () => {
    expect(studioState({ stage: "studio-clip", status: "failed" })).toMatchObject({ dot: "amber", triangle: true });
    expect(studioState({ stage: "studio-clip", status: "cancelled" })).toMatchObject({ word: "Stopped", dot: "grey" });
  });
});

describe("failureNotice", () => {
  it("says 'You weren't charged' only when cost is 0 and the step was metered", () => {
    const error = { code: "provider_timeout", message: "" };
    expect(failureNotice({ error, costUsd: 0, meteredSteps: 1 }).message).toContain("You weren't charged");
    expect(failureNotice({ error, costUsd: 0, meteredSteps: 0 }).message).not.toContain("charged");
    expect(failureNotice({ error, costUsd: "0.48", meteredSteps: 1 }).message).not.toContain("charged");
    expect(failureNotice({ error, costUsd: null, meteredSteps: null }).message).not.toContain("charged");
  });

  it("routes refusals to Ask for a change and the guard to Raise limit", () => {
    expect(failureNotice({ error: { code: "content_refused", message: "" } }).action).toBe("ask-for-change");
    expect(failureNotice({ error: { code: "spend_guard", message: "" } }, "5").message).toBe(
      "This would take the video past its $5.00 limit.",
    );
  });
});

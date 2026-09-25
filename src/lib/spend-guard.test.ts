import { describe, expect, it } from "vitest";

import { checkSpend, toMicros } from "./spend-guard";

const base = { limitUsd: "5", spentUsd: "0", inflightUsd: "0" };

describe("checkSpend", () => {
  it("refuses a run with no estimate", () => {
    expect(checkSpend({ ...base, estimateUsd: undefined })).toEqual({ ok: false, reason: "no_estimate" });
    expect(checkSpend({ ...base, estimateUsd: null })).toMatchObject({ ok: false, reason: "no_estimate" });
    expect(checkSpend({ ...base, estimateUsd: "abc" })).toMatchObject({ ok: false, reason: "no_estimate" });
  });

  it("allows a run that fits, counting spent and in-flight estimates", () => {
    expect(checkSpend({ ...base, spentUsd: "2.5", inflightUsd: "1.5", estimateUsd: "1" })).toEqual({ ok: true, projectedUsd: "5.000000" });
  });

  it("refuses one that would pass the per-video limit", () => {
    expect(checkSpend({ ...base, spentUsd: "4.6", estimateUsd: "0.48" })).toMatchObject({ ok: false, reason: "project_limit" });
  });

  it("refuses when the workspace budget would be exceeded", () => {
    const r = checkSpend({ ...base, estimateUsd: "0.48", workspace: { monthUsd: "1.8", budgetUsd: "2" } });
    expect(r).toMatchObject({ ok: false, reason: "workspace_budget" });
  });

  it("does no float drift: ten 0.1 runs sum to exactly 1", () => {
    let inflight = 0;
    for (let i = 0; i < 10; i++) inflight += toMicros("0.1");
    expect(inflight).toBe(toMicros("1"));
  });
});

import { describe, expect, it } from "vitest";

import { readStageOutput } from "@/lib/tamtree/read-output";
import { MockTamtreeAdapter } from "@/lib/tamtree/mock/mock-adapter";

import { adapterContract } from "./adapter.contract";

// 1000× faster: a 12s clip takes 12ms.
const fast = (scenario: ConstructorParameters<typeof MockTamtreeAdapter>[0] = {}) =>
  new MockTamtreeAdapter({ speed: 1000, ...scenario });

adapterContract("mock", { adapter: () => fast(), timeoutMs: 2_000 });

describe("mock scenarios", () => {
  const clipFor = (i: number) => ({ scene_key: `scene-${i}`, visual_prompt: "x", seconds: 6, take: 1 });

  async function settle(a: MockTamtreeAdapter, runId: string) {
    for (;;) {
      const r = await a.getRun(runId);
      if (["completed", "failed", "cancelled"].includes(r.status)) return r;
      await new Promise((res) => setTimeout(res, 5));
    }
  }

  it("three-hearts: scene 6 fails once with a provider timeout at no cost, then succeeds on retry", async () => {
    const a = fast({ scenario: "three-hearts" });
    const runs = [];
    for (let i = 1; i <= 6; i++) runs.push((await a.triggerRun("studio-clip", clipFor(i), { idempotencyKey: `k${i}` })).run.id);
    const sixth = await settle(a, runs[5]);
    expect(sixth.status).toBe("failed");
    expect(sixth.error).toMatchObject({ code: "provider_timeout" });
    expect(sixth.total_cost_usd).toBe(0);
    expect(sixth.metered_steps).toBe(1);

    const retry = await a.triggerRun("studio-clip", clipFor(6), { idempotencyKey: "k6-retry" });
    expect((await settle(a, retry.run.id)).status).toBe("completed");
  });

  it("draft script for the octopus topic returns the canvas beats", async () => {
    const a = fast();
    const { run } = await a.triggerRun(
      "studio-script",
      { mode: "draft", brief: { topic: "Why an octopus has three hearts", length_s: 45, tone: "curious", look: "nature", voice: "Zephyr" } },
      { idempotencyKey: "script" },
    );
    await settle(a, run.id);
    const out = readStageOutput("studio-script", await a.getRunOutput(run.id));
    expect("beats" in out && out.beats).toHaveLength(6);
  });

  it("failNext forces a failure on the next run of that flow only", async () => {
    const a = fast();
    a.failNext("studio-narrate", "internal_error");
    const input = { scene_key: "s1", phrases: ["Hello there."], voice: "Zephyr" };
    const first = await a.triggerRun("studio-narrate", input, { idempotencyKey: "n1" });
    expect((await settle(a, first.run.id)).status).toBe("failed");
    const second = await a.triggerRun("studio-narrate", input, { idempotencyKey: "n2" });
    expect((await settle(a, second.run.id)).status).toBe("completed");
  });
});

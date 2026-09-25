/**
 * The Tamtree adapter contract suite (07-frontend-first §1).
 *
 * Track F runs it against the mock; Track W1 is done when the SAME suite passes against
 * LiveTamtreeAdapter on a dev stack. Only assert what /v1 guarantees — never mock
 * internals — so the suite stays valid for both.
 */
import { describe, expect, it } from "vitest";

import type { TamtreeAdapter } from "@/lib/tamtree/adapter";
import { readStageOutput } from "@/lib/tamtree/read-output";
import { isTerminal, type RunEventOut, type RunOut } from "@/lib/tamtree/types";

export type ContractContext = {
  adapter: () => TamtreeAdapter;
  /** Upper bound for a clip run to finish in this environment. */
  timeoutMs: number;
};

async function waitTerminal(adapter: TamtreeAdapter, runId: string, timeoutMs: number): Promise<RunOut> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const run = await adapter.getRun(runId);
    if (isTerminal(run.status)) return run;
    if (Date.now() > deadline) throw new Error(`run ${runId} still ${run.status} after ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

const key = () => `test-${crypto.randomUUID()}`;
const clip = (scene: string, take = 1) => ({
  scene_key: scene,
  visual_prompt: "A slow push through dark water.",
  seconds: 6,
  take,
});

export function adapterContract(name: string, ctx: ContractContext): void {
  describe(`TamtreeAdapter contract — ${name}`, () => {
    it("runs a stage flow to completion with a contract-valid output and a cost", async () => {
      const a = ctx.adapter();
      const { run } = await a.triggerRun("studio-clip", clip(`s-${key()}`), { idempotencyKey: key() });
      expect(run.id).toBeTruthy();
      const done = await waitTerminal(a, run.id, ctx.timeoutMs);
      expect(done.status).toBe("completed");
      expect(done.total_cost_usd).toBeGreaterThanOrEqual(0);
      const out = readStageOutput("studio-clip", await a.getRunOutput(run.id));
      expect(out.duration_s).toBeGreaterThan(0);
      const assets = await a.listRunAssets(run.id);
      expect(assets.map((x) => x.id)).toContain(out.asset_id);
    });

    it("replays the same run for a repeated Idempotency-Key", async () => {
      const a = ctx.adapter();
      const k = key();
      const input = clip(`s-${key()}`);
      const first = await a.triggerRun("studio-clip", input, { idempotencyKey: k });
      const second = await a.triggerRun("studio-clip", input, { idempotencyKey: k });
      expect(second.run.id).toBe(first.run.id);
    });

    it("reuses an identical input for free, and a new take is a new clip", async () => {
      const a = ctx.adapter();
      const scene = `s-${key()}`;
      const first = await a.triggerRun("studio-clip", clip(scene), { idempotencyKey: key() });
      await waitTerminal(a, first.run.id, ctx.timeoutMs);
      const again = await a.triggerRun("studio-clip", clip(scene), { idempotencyKey: key() });
      const againRun = await waitTerminal(a, again.run.id, ctx.timeoutMs);
      expect(againRun.total_cost_usd).toBe(0);
      expect(readStageOutput("studio-clip", await a.getRunOutput(again.run.id)).reused).toBe(true);

      const take2 = await a.triggerRun("studio-clip", clip(scene, 2), { idempotencyKey: key() });
      await waitTerminal(a, take2.run.id, ctx.timeoutMs);
      const t1 = readStageOutput("studio-clip", await a.getRunOutput(first.run.id));
      const t2 = readStageOutput("studio-clip", await a.getRunOutput(take2.run.id));
      expect(t2.reused).toBe(false);
      expect(t2.asset_id).not.toBe(t1.asset_id);
    });

    it("streams events in seq order ending in a terminal event, and lists the same events", async () => {
      const a = ctx.adapter();
      const { run } = await a.triggerRun("studio-clip", clip(`s-${key()}`), { idempotencyKey: key() });
      const streamed: RunEventOut[] = [];
      for await (const e of a.streamRunEvents(run.id)) streamed.push(e);
      expect(streamed.map((e) => e.seq)).toEqual(streamed.map((_, i) => i + 1));
      expect(["run_complete", "run_failed"]).toContain(streamed.at(-1)!.event);
      const page = await a.listRunEvents(run.id);
      expect(page.items.map((e) => e.seq)).toEqual(streamed.map((e) => e.seq));

      const tail = await a.listRunEvents(run.id, { afterSeq: 1 });
      expect(tail.items[0]?.seq).toBe(2);
    });

    it("cancels a running run, and refuses to cancel a finished one", async () => {
      const a = ctx.adapter();
      const { run } = await a.triggerRun("studio-clip", clip(`s-${key()}`), { idempotencyKey: key() });
      const accepted = await a.cancelRun(run.id);
      expect(accepted.run_id).toBe(run.id);
      const done = await waitTerminal(a, run.id, ctx.timeoutMs);
      expect(done.status).toBe("cancelled");
      await expect(a.cancelRun(run.id)).rejects.toMatchObject({ status: 409 });
    });

    it("reports month-to-date usage as decimal strings", async () => {
      const usage = await ctx.adapter().getUsageSummary();
      expect(usage.month).toMatch(/^\d{4}-\d{2}$/);
      expect(Number.isFinite(Number(usage.cost_usd))).toBe(true);
    });
  });
}

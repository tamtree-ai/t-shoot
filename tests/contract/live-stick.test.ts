import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { stickCatalog } from "@/lib/stick/registry";
import { LiveTamtreeAdapter } from "@/lib/tamtree/live-adapter";
import { readStageOutput } from "@/lib/tamtree/read-output";
import { StickScriptOut } from "@/lib/tamtree/stage-flows";
import { isTerminal } from "@/lib/tamtree/types";

/**
 * K6 / W1: the stick flows against a REAL Tamtree. Spends money (one chat call), so it runs
 * only with TAMTREE_LIVE=1 plus TAMTREE_BASE_URL / TAMTREE_API_KEY (/ TAMTREE_FLOW_IDS).
 * The studio-clip contract suite joins it on live once Track P's flows exist.
 */
const env = process.env;
const enabled = env.TAMTREE_LIVE === "1" && !!env.TAMTREE_BASE_URL && !!env.TAMTREE_API_KEY;

describe.skipIf(!enabled)("live stick flows", () => {
  const a = () =>
    new LiveTamtreeAdapter({
      baseUrl: env.TAMTREE_BASE_URL!,
      apiKey: env.TAMTREE_API_KEY!,
      flowIds: env.TAMTREE_FLOW_IDS ? Object.fromEntries(env.TAMTREE_FLOW_IDS.split(",").map((p) => p.split("=") as [string, string])) : undefined,
    });
  const brief = { topic: "group chats", cast: [{ id: "milo", character: "milo" }, { id: "june", character: "june" }], allowed_sets: ["cafe-1", "office-1"] };

  async function settle(runId: string) {
    const deadline = Date.now() + 240_000;
    for (;;) {
      const r = await a().getRun(runId);
      if (isTerminal(r.status)) return r;
      if (Date.now() > deadline) throw new Error(`run ${runId} still ${r.status}`);
      await new Promise((res) => setTimeout(res, 1_000));
    }
  }

  it("stops a stale catalog pin before any spend", async () => {
    const { run } = await a().triggerRun("stick-script", { mode: "draft", catalog_version: "c1-0000000000000000", brief } as never, { idempotencyKey: `live-${crypto.randomUUID()}` });
    const done = await settle(run.id);
    expect(done.status).toBe("failed");
    expect(Number(done.total_cost_usd)).toBe(0);
  }, 300_000);

  it("drafts a contract-valid skit, and the stream ends in a terminal event", async () => {
    const { run } = await a().triggerRun("stick-script", { mode: "draft", catalog_version: stickCatalog.version, brief } as never, { idempotencyKey: `live-${crypto.randomUUID()}` });
    const events = [];
    for await (const e of a().streamRunEvents(run.id)) events.push(e);
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
    const done = await settle(run.id);
    expect(done.status).toBe("completed");
    const out = readStageOutput("stick-script", await a().getRunOutput(run.id));
    expect(StickScriptOut.parse(out)).toEqual(out);
    expect(out.lines.length).toBeGreaterThanOrEqual(11);
  }, 300_000);
});

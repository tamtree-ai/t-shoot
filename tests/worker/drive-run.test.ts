import { describe, expect, it } from "vitest";

import type { RunRecord } from "@/db/schema";
import { MockTamtreeAdapter } from "@/lib/tamtree/mock/mock-adapter";
import { driveRun, type RunPatch, type RunStore } from "@/worker/drive-run";

class MemoryStore implements RunStore {
  rows = new Map<string, RunRecord>();
  async get(id: string) {
    return this.rows.get(id) ?? null;
  }
  async patch(id: string, patch: RunPatch) {
    this.rows.set(id, { ...this.rows.get(id)!, ...patch });
  }
  add(over: Partial<RunRecord> = {}): RunRecord {
    const row: RunRecord = {
      id: crypto.randomUUID(),
      projectId: "p1",
      sceneId: null,
      takeId: null,
      flow: "studio-clip",
      stage: "clip",
      tamtreeRunId: null,
      idempotencyKey: crypto.randomUUID(),
      status: "pending",
      estimateUsd: "0.480000",
      costUsd: null,
      meteredSteps: null,
      unpricedSteps: null,
      error: null,
      lastEventSeq: 0,
      input: { scene_key: "s1", visual_prompt: "x", seconds: 6, take: 1 },
      output: null,
      confirmedBy: "m1",
      createdAt: new Date(),
      updatedAt: new Date(),
      ...over,
    };
    this.rows.set(row.id, row);
    return row;
  }
}

const adapter = (o: ConstructorParameters<typeof MockTamtreeAdapter>[0] = {}) =>
  new MockTamtreeAdapter({ speed: 200, ...o });

describe("driveRun", () => {
  it("drives a run to completion and records cost, status and validated output", async () => {
    const store = new MemoryStore();
    const row = store.add();
    await driveRun(row.id, { store, adapter: adapter() });
    const done = store.rows.get(row.id)!;
    expect(done.status).toBe("completed");
    expect(Number(done.costUsd)).toBeGreaterThan(0);
    expect(done.output).toMatchObject({ reused: false });
    expect(done.lastEventSeq).toBeGreaterThan(0);
  });

  it("records a failed run with its error code and zero cost", async () => {
    const store = new MemoryStore();
    const a = adapter();
    a.failNext("studio-clip", "provider_timeout");
    const row = store.add();
    await driveRun(row.id, { store, adapter: a });
    const done = store.rows.get(row.id)!;
    expect(done).toMatchObject({ status: "failed", error: { code: "provider_timeout" }, meteredSteps: 1 });
    expect(Number(done.costUsd)).toBe(0);
  });

  it("recovers after the worker is killed mid-run: no second run, no lost events", async () => {
    const store = new MemoryStore();
    const a = adapter({ speed: 20 }); // Tamtree outlives the worker
    const row = store.add();

    // Worker #1 starts, sees the run begin, then is killed.
    const kill = new AbortController();
    const first = driveRun(row.id, { store, adapter: a, signal: kill.signal });
    while (!store.rows.get(row.id)!.tamtreeRunId) await new Promise((r) => setTimeout(r, 2));
    kill.abort();
    await first;
    const mid = store.rows.get(row.id)!;
    expect(["completed", "failed", "cancelled"]).not.toContain(mid.status);

    // Worker #2 picks the same row up.
    await driveRun(row.id, { store, adapter: a });
    const done = store.rows.get(row.id)!;
    expect(done.status).toBe("completed");
    expect(done.tamtreeRunId).toBe(mid.tamtreeRunId); // resumed, not re-triggered
    expect((await a.getUsageSummary()).cost_usd).toBe("0.480000"); // charged once
  });

  it("re-triggering after a crash before the run id was saved does not double-charge", async () => {
    const store = new MemoryStore();
    const a = adapter();
    const row = store.add();
    // Simulate: trigger reached Tamtree, the worker died before saving tamtree_run_id.
    await a.triggerRun("studio-clip", row.input as never, { idempotencyKey: row.idempotencyKey });
    await driveRun(row.id, { store, adapter: a });
    expect(store.rows.get(row.id)!.status).toBe("completed");
    expect((await a.getUsageSummary()).cost_usd).toBe("0.480000");
  });

  it("marks a run whose Tamtree run has vanished as failed (run_lost)", async () => {
    const store = new MemoryStore();
    const row = store.add({ tamtreeRunId: "run_gone", status: "running" });
    await driveRun(row.id, { store, adapter: adapter() });
    expect(store.rows.get(row.id)).toMatchObject({ status: "failed", error: { code: "run_lost" } });
  });

  it("is a no-op for a run that is already terminal", async () => {
    const store = new MemoryStore();
    const row = store.add({ status: "completed" });
    await driveRun(row.id, { store, adapter: adapter() });
    expect(store.rows.get(row.id)!.tamtreeRunId).toBeNull();
  });
});

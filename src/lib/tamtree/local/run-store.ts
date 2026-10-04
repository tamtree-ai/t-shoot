/**
 * Runs and assets on disk for the local adapter (standalone plan §2), so the Next server and the
 * worker see the same runs without a database migration:
 *
 *   <dir>/runs/<id>/run.json      RunOut + who is running it (pid, host)
 *   <dir>/runs/<id>/events.jsonl  one RunEventOut per line, seq from 1
 *   <dir>/runs/<id>/output.json   RunOutputOut, once completed
 *   <dir>/runs/<id>/assets.json   asset ids the run made
 *   <dir>/runs/<id>/cancel        present once a cancel was asked for
 *   <dir>/keys/<sha>.json         Idempotency-Key → run id
 *   <dir>/assets/<id>, <id>.json  bytes + AssetOut
 *
 * Only the process that runs a flow writes its run. A run whose process is gone is reported
 * failed (`interrupted`), never resumed silently.
 */
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { TamtreeError } from "../adapter";
import type { AssetOut, RunEventOut, RunEventPage, RunOut, RunOutputOut } from "../types";
import { isTerminal } from "../types";

type Owner = { pid: number; host: string };
type StoredRun = RunOut & { owner?: Owner };

const writeAtomic = (file: string, data: string | Uint8Array) => {
  const tmp = `${file}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
};

const alive = (owner: Owner | undefined): boolean => {
  if (!owner || owner.host !== os.hostname()) return true; // can't tell from here: assume it is
  if (owner.pid === process.pid) return true;
  try {
    process.kill(owner.pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
};

export const INTERRUPTED = {
  code: "interrupted",
  message: "This run stopped when t-shoot's worker restarted. Nothing was charged; start it again.",
};

export class LocalRunStore {
  constructor(readonly dir: string) {
    fs.mkdirSync(path.join(dir, "runs"), { recursive: true });
    fs.mkdirSync(path.join(dir, "keys"), { recursive: true });
    fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
  }

  private runDir(id: string): string {
    if (!/^run_[0-9a-f-]+$/.test(id)) throw new TamtreeError("Run not found.", 404, "not_found");
    return path.join(this.dir, "runs", id);
  }

  private keyFile(key: string): string {
    return path.join(this.dir, "keys", `${createHash("sha256").update(key).digest("hex").slice(0, 32)}.json`);
  }

  byKey(key: string): string | undefined {
    try {
      return (JSON.parse(fs.readFileSync(this.keyFile(key), "utf8")) as { runId: string }).runId;
    } catch {
      return undefined;
    }
  }

  create(flow: string, input: unknown, key: string, metadata: Record<string, string> | undefined): RunOut {
    const id = `run_${randomUUID()}`;
    const run: StoredRun = {
      id,
      flow_id: flow,
      flow_version: 1,
      status: "queued",
      error: null,
      created_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      metadata: metadata ?? null,
      output_ref: null,
      trigger_type: "api",
      tokens_in: 0,
      tokens_out: 0,
      total_cost_usd: 0,
      metered_steps: 0,
      pinned_steps: 0,
      unpriced_steps: 0,
      owner: { pid: process.pid, host: os.hostname() },
    };
    const dir = this.runDir(id);
    fs.mkdirSync(dir, { recursive: true });
    writeAtomic(path.join(dir, "input.json"), JSON.stringify(input));
    writeAtomic(path.join(dir, "run.json"), JSON.stringify(run));
    fs.writeFileSync(path.join(dir, "events.jsonl"), "");
    // `wx`: two triggers racing on one key keep the first run.
    try {
      fs.writeFileSync(this.keyFile(key), JSON.stringify({ runId: id }), { flag: "wx" });
    } catch {
      fs.rmSync(dir, { recursive: true, force: true });
      return this.get(this.byKey(key)!);
    }
    return strip(run);
  }

  input(id: string): unknown {
    return JSON.parse(fs.readFileSync(path.join(this.runDir(id), "input.json"), "utf8"));
  }

  private read(id: string): StoredRun {
    try {
      return JSON.parse(fs.readFileSync(path.join(this.runDir(id), "run.json"), "utf8")) as StoredRun;
    } catch {
      throw new TamtreeError("Run not found.", 404, "not_found");
    }
  }

  /** The run as /v1 shows it. A run whose process is gone is failed here, once, for everyone. */
  get(id: string): RunOut {
    const run = this.read(id);
    if (!isTerminal(run.status) && !alive(run.owner)) {
      this.finish(id, "failed", INTERRUPTED);
      return strip(this.read(id));
    }
    return strip(run);
  }

  patch(id: string, patch: Partial<RunOut>): RunOut {
    const next = { ...this.read(id), ...patch };
    writeAtomic(path.join(this.runDir(id), "run.json"), JSON.stringify(next));
    return strip(next);
  }

  /** Terminal status + its event, written once. */
  finish(id: string, status: "completed" | "failed" | "cancelled", error: { code: string; message: string } | null): void {
    const run = this.read(id);
    if (isTerminal(run.status)) return;
    this.patch(id, { status, error, completed_at: new Date().toISOString() });
    if (status === "completed") this.emit(id, "run_complete", { output_ref: run.output_ref });
    else this.emit(id, "run_failed", { error: error ?? { code: status, message: status } });
  }

  emit(id: string, event: string, payload: Record<string, unknown>, stepId: string | null = null): RunEventOut {
    const file = path.join(this.runDir(id), "events.jsonl");
    const seq = this.allEvents(id).length + 1;
    const e: RunEventOut = { seq, event, payload, step_id: stepId, iteration: null, member: null, created_at: new Date().toISOString() };
    fs.appendFileSync(file, `${JSON.stringify(e)}\n`);
    return e;
  }

  allEvents(id: string): RunEventOut[] {
    const text = fs.readFileSync(path.join(this.runDir(id), "events.jsonl"), "utf8");
    return text
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as RunEventOut);
  }

  events(id: string, afterSeq = 0, limit = 100): RunEventPage {
    this.get(id);
    const all = this.allEvents(id).filter((e) => e.seq > afterSeq);
    const items = all.slice(0, limit);
    return { items, next_after_seq: all.length > items.length ? items.at(-1)!.seq : null };
  }

  setOutput(id: string, output: RunOutputOut): void {
    writeAtomic(path.join(this.runDir(id), "output.json"), JSON.stringify(output));
    this.patch(id, { output_ref: output.output_ref });
  }

  output(id: string): RunOutputOut {
    this.get(id);
    try {
      return JSON.parse(fs.readFileSync(path.join(this.runDir(id), "output.json"), "utf8")) as RunOutputOut;
    } catch {
      return { output_ref: null, ports: {} };
    }
  }

  requestCancel(id: string): void {
    fs.writeFileSync(path.join(this.runDir(id), "cancel"), new Date().toISOString());
  }

  cancelRequested(id: string): boolean {
    return fs.existsSync(path.join(this.runDir(id), "cancel"));
  }

  addAsset(runId: string, name: string, mimeType: string, bytes: Uint8Array): string {
    const id = randomUUID();
    const meta: AssetOut = { id, name, mime_type: mimeType, size_bytes: bytes.byteLength, created_at: new Date().toISOString() };
    writeAtomic(path.join(this.dir, "assets", id), bytes);
    writeAtomic(path.join(this.dir, "assets", `${id}.json`), JSON.stringify(meta));
    const list = path.join(this.runDir(runId), "assets.json");
    const ids = fs.existsSync(list) ? (JSON.parse(fs.readFileSync(list, "utf8")) as string[]) : [];
    writeAtomic(list, JSON.stringify([...ids, id]));
    return id;
  }

  listAssets(runId: string): AssetOut[] {
    this.get(runId);
    const list = path.join(this.runDir(runId), "assets.json");
    const ids = fs.existsSync(list) ? (JSON.parse(fs.readFileSync(list, "utf8")) as string[]) : [];
    return ids.map((id) => this.asset(id).meta);
  }

  asset(id: string): { meta: AssetOut; file: string } {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new TamtreeError("Asset not found.", 404, "not_found");
    const file = path.join(this.dir, "assets", id);
    try {
      return { meta: JSON.parse(fs.readFileSync(`${file}.json`, "utf8")) as AssetOut, file };
    } catch {
      throw new TamtreeError("Asset not found.", 404, "not_found");
    }
  }
}

function strip(run: StoredRun): RunOut {
  const out = { ...run };
  delete out.owner;
  return out;
}

/**
 * Writer-contract batch 4: a fixed set of stick-script drafts and change requests,
 * scored against a live Tamtree. Spends money (about $0.01 each, $0.02 if a reply
 * is repaired). Nothing here is the app: it calls t-shoot's live adapter directly.
 *
 *   pnpm eval:writer -- --yes --label baseline-minimax
 *
 * Needs TAMTREE_BASE_URL, TAMTREE_API_KEY and TAMTREE_FLOW_IDS (the runtime key).
 * Writes eval-reports/<stamp>-<label>.md and .json.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { stickCatalog } from "@/lib/stick/registry";
import { LiveTamtreeAdapter } from "@/lib/tamtree/live-adapter";
import { readStageOutput } from "@/lib/tamtree/read-output";
import type { StickBrief } from "@/lib/tamtree/stage-flows";
import { StickScriptOut as StickScriptOutSchema, type StickScriptOut } from "@/lib/tamtree/stage-flows";
import { isTerminal, type RunOut } from "@/lib/tamtree/types";
import { draftKeepsPlan, reviseKeepsPlan, scenePlanOf } from "@/types/stick-skit/writer-eval";

const pair = [
  { id: "milo", character: "milo" },
  { id: "june", character: "june" },
];
const milo = [{ id: "milo", character: "milo" }];
const selves = [
  { id: "me", character: "milo", label: "me" },
  { id: "other", character: "milo", label: "my brain" },
];

/** Twenty briefs, five of each length. The scene count is what the brief asked for. */
const DRAFTS: { id: string; brief: StickBrief }[] = [
  { id: "d01", brief: { topic: "Replying sounds good to a message you did not read", template: "exchange", cast: pair, set: "cafe-1", tone: "deadpan" } },
  { id: "d02", brief: { topic: "A group chat that replies to itself", cast: pair } },
  { id: "d03", brief: { topic: "Someone interviewing their own reflection about lunch", template: "interview", cast: pair, set: "street-1" } },
  { id: "d04", brief: { topic: "Narrating a walk to the fridge and forgetting why", template: "pov-monologue", cast: milo, set: "kitchen-1", tone: "dry" } },
  { id: "d05", brief: { topic: "Arguing with yourself about whether to send the text", template: "me-vs-me", cast: selves, set: "bedroom-1" } },
  { id: "d06", brief: { topic: "Leaving a cafe and immediately missing it", template: "exchange", cast: pair, scenes: 2, sets: ["cafe-1", "street-1"] } },
  { id: "d07", brief: { topic: "A meeting that continues in the car park", cast: pair, scenes: 2 } },
  { id: "d08", brief: { topic: "Starting an apology in the kitchen and finishing it in the hall", template: "exchange", cast: pair, scenes: 2, sets: ["kitchen-1"] } },
  { id: "d09", brief: { topic: "One word on screen, then the face that has to live with it", template: "text-slam", cast: milo, scenes: 2, sets: ["plain-1", "living-1"] } },
  { id: "d10", brief: { topic: "Promising to be on time and arriving in a different scene", template: "exchange", cast: pair, scenes: 2, tone: "chaotic" } },
  { id: "d11", brief: { topic: "Three tries to leave a party", template: "exchange", cast: pair, scenes: 3, sets: ["living-1", "kitchen-1", "street-1"] } },
  { id: "d12", brief: { topic: "A rumour that changes room each time it is repeated", cast: pair, scenes: 3 } },
  { id: "d13", brief: { topic: "Interviewing someone who keeps walking away", template: "interview", cast: pair, scenes: 3, sets: ["street-1", "park-1"] } },
  { id: "d14", brief: { topic: "Planning a surprise in three rooms, badly", template: "exchange", cast: pair, scenes: 3, sets: ["bedroom-1", "kitchen-1", "living-1"], tone: "wholesome" } },
  { id: "d15", brief: { topic: "A monologue that has to cross the flat to make its point", template: "pov-monologue", cast: milo, scenes: 3 } },
  { id: "d16", brief: { topic: "A day at four locations, one joke", template: "exchange", cast: pair, scenes: 4, sets: ["bedroom-1", "cafe-1", "office-1", "living-1"] } },
  { id: "d17", brief: { topic: "Looking for a phone through the whole flat and the street", cast: pair, scenes: 4 } },
  { id: "d18", brief: { topic: "An interview that will not stay on the street", template: "interview", cast: pair, scenes: 4, sets: ["street-1", "park-1", "cafe-1"] } },
  { id: "d19", brief: { topic: "Me versus me, moving house in four beats", template: "me-vs-me", cast: selves, scenes: 4, sets: ["bedroom-1", "living-1", "kitchen-1", "street-1"] } },
  { id: "d20", brief: { topic: "Four scenes of deciding not to send the email", template: "exchange", cast: pair, scenes: 4, tone: "dry" } },
];

const CHANGES = [
  "Make June meaner",
  "Land the punchline sooner",
  "Cut one line",
  "Give Milo the last word",
  "Make it shorter",
  "Swap who sets up the joke",
  "Make the middle line quieter",
  "Keep the staging and change only the words",
  "End on the receipt, not the apology",
  "Do not add a character",
];

type Row = {
  id: string;
  kind: "draft" | "revise";
  asked: string;
  status: string;
  parsed: boolean;
  checkOk: boolean | null;
  errors: number | null;
  planKept: boolean | null;
  scenesGot: number | null;
  ms: number;
  costUsd: number;
  runId: string | null;
  note: string;
};

const args = process.argv.slice(2);
const yes = args.includes("--yes");
const label = args.find((a, i) => args[i - 1] === "--label") ?? "baseline-minimax";

const baseUrl = process.env.TAMTREE_BASE_URL;
const apiKey = process.env.TAMTREE_API_KEY;
const flowIds = process.env.TAMTREE_FLOW_IDS;

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!yes) die("This spends money on live Tamtree. Re-run with --yes.");
if (!baseUrl || !apiKey || !flowIds) die("Set TAMTREE_BASE_URL, TAMTREE_API_KEY and TAMTREE_FLOW_IDS.");

const knownSets = new Set(stickCatalog.sets.map((s) => s.id));
for (const { id, brief } of DRAFTS) {
  for (const set of [...(brief.sets ?? []), ...(brief.set ? [brief.set] : [])]) {
    if (!knownSets.has(set)) die(`${id} names a set the catalog does not have: ${set}`);
  }
}

const adapter = new LiveTamtreeAdapter({
  baseUrl,
  apiKey,
  flowIds: Object.fromEntries(flowIds.split(",").map((p) => p.trim().split("=") as [string, string])),
});

const allowedSets = stickCatalog.sets.map((s) => s.id);

async function settle(runId: string): Promise<RunOut> {
  const deadline = Date.now() + 240_000;
  for (;;) {
    const run = await adapter.getRun(runId);
    if (isTerminal(run.status)) return run;
    if (Date.now() > deadline) throw new Error(`run ${runId} still ${run.status} after 240s`);
    await new Promise((r) => setTimeout(r, 1_000));
  }
}

function errorNote(error: RunOut["error"]): string {
  if (!error) return "";
  const message = error.message ?? error.detail ?? error.code;
  return typeof message === "string" ? message : JSON.stringify(error);
}

async function runFlow(input: unknown): Promise<{ run: RunOut; out: StickScriptOut | null; parseError: string; ms: number }> {
  const started = Date.now();
  const { run } = await adapter.triggerRun("stick-script", input as never, { idempotencyKey: `eval-writer-${crypto.randomUUID()}` });
  const done = await settle(run.id);
  const ms = Date.now() - started;
  if (done.status !== "completed") return { run: done, out: null, parseError: errorNote(done.error), ms };
  try {
    const out = readStageOutput("stick-script", await adapter.getRunOutput(done.id));
    const parsed = StickScriptOutSchema.safeParse(out);
    if (!parsed.success) return { run: done, out: null, parseError: parsed.error.issues.map((i) => i.message).join("; "), ms };
    return { run: done, out: parsed.data, parseError: "", ms };
  } catch (e) {
    return { run: done, out: null, parseError: e instanceof Error ? e.message : String(e), ms };
  }
}

function money(n: number): string {
  return `$${n.toFixed(4)}`;
}

async function main(): Promise<void> {
const rows: Row[] = [];
const skits = new Map<string, Record<string, unknown>>();

console.log(`eval-stick-writer: ${DRAFTS.length} drafts + ${CHANGES.length} changes, catalog ${stickCatalog.version}, label ${label}`);

for (const { id, brief } of DRAFTS) {
  const asked = brief.scenes ? `${brief.scenes} scenes` : "1 scene";
  process.stdout.write(`${id} ${asked} … `);
  try {
    const { run, out, parseError, ms } = await runFlow({
      mode: "draft",
      catalog_version: stickCatalog.version,
      brief: { ...brief, allowed_sets: allowedSets },
    });
    const plan = out ? scenePlanOf(out.skit) : null;
    const checkOk = out ? out.check.ok && out.check.errors === 0 : null;
    const planKept = out ? draftKeepsPlan(brief, out.skit) : null;
    if (out) skits.set(id, out.skit);
    rows.push({
      id,
      kind: "draft",
      asked,
      status: run.status,
      parsed: !!out,
      checkOk,
      errors: out?.check.errors ?? null,
      planKept,
      scenesGot: plan?.scenes ?? null,
      ms,
      costUsd: run.total_cost_usd,
      runId: run.id,
      note: parseError,
    });
    console.log(`${run.status} parse=${!!out} check=${checkOk} plan=${planKept} ${money(run.total_cost_usd)} ${ms}ms`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    rows.push({ id, kind: "draft", asked, status: "error", parsed: false, checkOk: null, errors: null, planKept: null, scenesGot: null, ms: 0, costUsd: 0, runId: null, note: message });
    console.log(`error ${message}`);
    if (rows.length === 1) {
      await writeReport();
      die("The first call never reached a run. Stopping so this does not keep spending.");
    }
  }
}

const base = rows.find((r) => r.kind === "draft" && r.parsed && r.checkOk) ?? rows.find((r) => r.kind === "draft" && r.parsed);
const baseSkit = base ? skits.get(base.id) : undefined;

if (!base || !baseSkit) {
  console.log("No draft parsed, so the change requests were not sent.");
} else {
  console.log(`Change requests start from ${base.id}.`);
  for (let i = 0; i < CHANGES.length; i++) {
    const id = `c${String(i + 1).padStart(2, "0")}`;
    const note = CHANGES[i]!;
    process.stdout.write(`${id} ${note} … `);
    try {
      const { run, out, parseError, ms } = await runFlow({
        mode: "revise",
        catalog_version: stickCatalog.version,
        skit: baseSkit,
        note,
      });
      const checkOk = out ? out.check.ok && out.check.errors === 0 : null;
      const planKept = out ? reviseKeepsPlan(baseSkit, out.skit) : null;
      rows.push({
        id,
        kind: "revise",
        asked: note,
        status: run.status,
        parsed: !!out,
        checkOk,
        errors: out?.check.errors ?? null,
        planKept,
        scenesGot: out ? scenePlanOf(out.skit).scenes : null,
        ms,
        costUsd: run.total_cost_usd,
        runId: run.id,
        note: parseError,
      });
      console.log(`${run.status} parse=${!!out} check=${checkOk} plan=${planKept} ${money(run.total_cost_usd)} ${ms}ms`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      rows.push({ id, kind: "revise", asked: note, status: "error", parsed: false, checkOk: null, errors: null, planKept: null, scenesGot: null, ms: 0, costUsd: 0, runId: null, note: message });
      console.log(`error ${message}`);
    }
  }
}

function tally(kind: Row["kind"]) {
  const list = rows.filter((r) => r.kind === kind);
  const cost = list.reduce((sum, r) => sum + Math.round(r.costUsd * 1e6), 0) / 1e6;
  const count = (key: "parsed" | "checkOk" | "planKept") => list.filter((r) => r[key] === true).length;
  return { n: list.length, parsed: count("parsed"), check: count("checkOk"), plan: count("planKept"), cost };
}

function usable(kind: Row["kind"]): number {
  return rows.filter((r) => r.kind === kind && r.parsed && r.checkOk && r.planKept).length;
}

async function writeReport(): Promise<void> {
  const drafts = tally("draft");
  const revises = tally("revise");
  const totalMicros = rows.reduce((sum, r) => sum + Math.round(r.costUsd * 1e6), 0);
  const md = [
    `# Stick-script writer evaluation — ${label}`,
    ``,
    `Catalog \`${stickCatalog.version}\`. ${new Date().toISOString()}.`,
    `Usable means the reply parsed, the check had no errors, and the scene plan held. The stick-script flow asks once more when a reply cannot be used, so this score is after that repair.`,
    ``,
    `| | n | parsed | check passed | plan kept | usable | cost |`,
    `|---|---:|---:|---:|---:|---:|---:|`,
    `| Drafts | ${drafts.n} | ${drafts.parsed} | ${drafts.check} | ${drafts.plan} | ${usable("draft")} | ${money(drafts.cost)} |`,
    `| Changes | ${revises.n} | ${revises.parsed} | ${revises.check} | ${revises.plan} | ${usable("revise")} | ${money(revises.cost)} |`,
    `| Total | ${rows.length} | | | | ${usable("draft") + usable("revise")} | ${money(totalMicros / 1e6)} |`,
    ``,
    `| id | asked | status | parsed | check | plan | scenes | ms | cost | note |`,
    `|---|---|---|---|---|---|---:|---:|---:|---|`,
    ...rows.map((r) => `| ${r.id} | ${r.asked} | ${r.status} | ${r.parsed ? "yes" : "no"} | ${r.checkOk === null ? "" : r.checkOk ? "yes" : "no"} | ${r.planKept === null ? "" : r.planKept ? "yes" : "no"} | ${r.scenesGot ?? ""} | ${r.ms} | ${money(r.costUsd)} | ${r.note.replace(/\|/g, "/").replace(/\s+/g, " ").trim()} |`),
    ``,
  ].join("\n");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = path.join(process.cwd(), "eval-reports");
  const stem = path.join(dir, `${stamp}-${label}`);
  await mkdir(dir, { recursive: true });
  await writeFile(`${stem}.md`, md);
  await writeFile(`${stem}.json`, JSON.stringify({ label, catalog: stickCatalog.version, at: new Date().toISOString(), rows }, null, 2));
  console.log(`\nWrote ${stem}.md`);
  console.log(md.split("\n").slice(0, 16).join("\n"));
}

await writeReport();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

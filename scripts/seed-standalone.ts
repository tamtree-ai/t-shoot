/**
 * Standalone seed (standalone plan §6): pnpm db:seed:standalone
 *
 *   - one org and one owner (no email of anyone's: `you@localhost`), for TAMSHOOT_AUTH=local
 *   - "Not being sarcastic", finished: demo/fine (skit + Kokoro voices) rendered once by the
 *     StickStage service, stored as a version, so the first screen plays something
 *   - "Your first video": a check-clean two-person script, ready for Approve, so Produce
 *     makes a real video on the first click
 *
 * Idempotent: a project that exists (by title and `origin: "demo"`) is left alone. Runs inside
 * the services (react-server conditions), so the projects are made the way the app makes them.
 * Needs TAMTREE_ADAPTER=local and StickStage up (it waits up to 3 minutes for /healthz).
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { and, eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { isStandalone } from "@/lib/standalone";
import { getTamtreeAdapter } from "@/lib/tamtree";
import { LocalStickAdapter } from "@/lib/tamtree/local/local-adapter";
import { StickStageClient } from "@/lib/tamtree/local/stickstage";
import { timelineDigest } from "@/lib/timeline";
import { createStickFromPaste } from "@/services/paste";
import { createStickSkitProject } from "@/services/projects";
import { stickSkit, type StickVersionPayload } from "@/types/stick-skit";
import { judgeSkit } from "@/types/stick-skit/draft";

const DEMO_DIR = path.resolve(process.env.TAMSHOOT_DEMO_DIR ?? "demo/fine");
const FINISHED = "Not being sarcastic";
const FIRST = "Your first video";
const FIRST_SCRIPT = `June: Why is there a sock in the fridge?
Milo: It keeps it fresh.
June: Socks don't go off, Milo.
Milo: Not with that attitude.
June: It's one sock.
Milo: The other one's in the freezer.`;

async function owner(): Promise<{ orgId: string; memberId: string }> {
  const [existing] = await db.select().from(schema.members).where(eq(schema.members.role, "owner")).limit(1);
  if (existing) return { orgId: existing.orgId, memberId: existing.id };
  const [org] = await db.insert(schema.orgs).values({ name: "My studio" }).returning();
  const [member] = await db.insert(schema.members).values({ orgId: org!.id, email: "you@localhost", name: "You", role: "owner" }).returning();
  console.log("created the local owner");
  return { orgId: org!.id, memberId: member!.id };
}

async function demoProject(orgId: string, title: string) {
  const [p] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(and(eq(schema.projects.orgId, orgId), eq(schema.projects.title, title), eq(schema.projects.origin, "demo")))
    .limit(1);
  return p?.id;
}

async function firstVideo(memberId: string, orgId: string): Promise<void> {
  if (await demoProject(orgId, FIRST)) return console.log(`"${FIRST}" is there`);
  const id = await createStickFromPaste(memberId, orgId, { script: FIRST_SCRIPT, mapping: { June: "june", Milo: "milo" }, setId: "living-1", limitUsd: "1.00" });
  await db.update(schema.projects).set({ title: FIRST, origin: "demo" }).where(eq(schema.projects.id, id));
  const [draft] = await db.select().from(schema.skitDrafts).where(eq(schema.skitDrafts.projectId, id));
  console.log(`created "${FIRST}" (${draft?.lines.length ?? 0} lines, check errors: ${(draft?.check as { errors?: number } | undefined)?.errors ?? "?"})`);
}

async function waitForStickStage(svc: StickStageClient): Promise<void> {
  for (let i = 0; i < 90; i++) {
    const h = await svc.health();
    if (h.ok && h.body.bundle === "ready") return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("StickStage did not become ready in 3 minutes; the finished demo was not made.");
}

/** demo/fine through the real render service, its files into the local store, then a version. */
async function finishedDemo(memberId: string, orgId: string): Promise<void> {
  if (await demoProject(orgId, FINISHED)) return console.log(`"${FINISHED}" is there`);
  const adapter = getTamtreeAdapter();
  if (!(adapter instanceof LocalStickAdapter)) throw new Error("The finished demo needs TAMTREE_ADAPTER=local.");
  const skit = JSON.parse(fs.readFileSync(path.join(DEMO_DIR, "skit.json"), "utf8")) as Record<string, unknown>;
  const voice = JSON.parse(fs.readFileSync(path.join(DEMO_DIR, "voice.json"), "utf8")) as { lines: { id: string; speaker: string; text: string; audio: string; durationMs?: number }[] };
  const svc = new StickStageClient({ baseUrl: process.env.STICKSTAGE_URL ?? "http://127.0.0.1:8787", token: process.env.STICKSTAGE_API_TOKEN });
  await waitForStickStage(svc);

  console.log(`rendering "${FINISHED}"…`);
  const lines = voice.lines.map((l) => ({ ...l, wav: new Uint8Array(fs.readFileSync(path.join(DEMO_DIR, l.audio))) }));
  const job = await svc.render(skit, lines);
  let last = job;
  for await (const j of svc.events(job.id)) {
    last = j;
    if (["succeeded", "failed", "cancelled"].includes(j.status)) break;
  }
  if (last.status !== "succeeded" || !last.outputs?.mp4) throw new Error(`The demo render ${last.status}: ${last.error?.message ?? "no MP4"}`);

  const store = adapter.store;
  const run = store.create("stick-produce", { demo: true }, `demo-${job.id}`, { origin: "demo" });
  const add = async (key: keyof NonNullable<typeof last.outputs>, name: string, mime: string) =>
    last.outputs?.[key] ? store.addAsset(run.id, name, mime, await svc.file(last.outputs[key]!)) : undefined;
  const mp4Bytes = await svc.file(last.outputs.mp4);
  const mp4 = store.addAsset(run.id, `${FINISHED}.mp4`, "video/mp4", mp4Bytes);
  const render = {
    mp4,
    srt: (await add("srt", `${FINISHED}.srt`, "application/x-subrip"))!,
    txt: (await add("txt", `${FINISHED}.txt`, "text/plain"))!,
    manifest: (await add("manifest", `${FINISHED}.manifest.json`, "application/json"))!,
    ...(last.outputs.cover ? { cover: (await add("cover", `${FINISHED}.cover.png`, "image/png"))! } : {}),
    ...(last.outputs.thumbnail ? { thumbnail: (await add("thumbnail", `${FINISHED}.thumbnail.png`, "image/png"))! } : {}),
  };
  store.finish(run.id, "completed", null);

  const projectId = await createStickSkitProject(memberId, orgId, {
    topic: FINISHED,
    cast: [{ id: "milo", character: "milo" }, { id: "june", character: "june" }],
    set: String(skit.set),
    limitUsd: "1.00",
  }, { origin: "demo" });
  const verdict = judgeSkit(skit);
  const catalogVersion = stickSkit.catalogVersion();
  const voices = { milo: "am_puck", june: "af_kore" };
  const digest = timelineDigest({ catalog_version: catalogVersion, skit, voices });
  const payload: StickVersionPayload = { skit, voices, catalog_version: catalogVersion, render, duration_s: Number(last.durationSec ?? 0), mp4_digest: createHash("sha256").update(mp4Bytes).digest("hex") };
  await db.transaction(async (tx) => {
    await tx.insert(schema.skitDrafts).values({
      projectId,
      skit,
      lines: verdict.lines,
      check: verdict.check,
      warnings: verdict.warnings,
      estimatedDurationS: verdict.estimatedDurationS,
      catalogVersion,
      digest: timelineDigest(skit),
      source: "edited",
    });
    await tx.insert(schema.projectVersions).values({ projectId, kind: stickSkit.kind, number: 1, payload, digest, renderAssetId: mp4, costUsd: "0" });
    await tx.update(schema.projects).set({ title: FINISHED, step: "review", scriptApprovedAt: new Date(), updatedAt: new Date() }).where(eq(schema.projects.id, projectId));
  });
  console.log(`created "${FINISHED}" (${last.durationSec} s, rendered by StickStage)`);
}

async function main() {
  if (!isStandalone()) throw new Error("pnpm db:seed:standalone is for standalone mode (TAMTREE_ADAPTER=local). Use pnpm db:seed otherwise.");
  const { orgId, memberId } = await owner();
  await firstVideo(memberId, orgId);
  await finishedDemo(memberId, orgId);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });

/**
 * The mock's `stick-script` / `stick-produce` (09 §7 K1.2). Staging and the self-check are
 * the real `stickstage` package, so what the mock returns is what the render service would
 * say about the same skit; only the model and the render are canned: the committed
 * `group-chat` skit, and a 270×480 cut of its render.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { checkDraft, placeholderVoice, SkitError } from "stickstage";

import { aspectOfBrief, FRAME, skitForEngine } from "@/lib/stick/frame";
import { stickCatalog, stickRegistry } from "@/lib/stick/registry";
import type { Skit, StickProduceIn, StickScriptIn, StickScriptOut } from "../stage-flows";
import premise from "./stick/group-chat.premise.json";
import groupChat from "./stick/group-chat.skit.json";

export type StickMockFailure = "catalog_mismatch" | "invalid_skit";

type Beat = { id: string; speaker?: string; line?: string };
type Scene = { id: string; set: string; beats: Beat[] };
type StickBrief = Extract<StickScriptIn, { mode: "draft" }>["brief"];

const clone = <T>(v: T): T => structuredClone(v);

/** The canned skit is a short. A widescreen brief states its pixels without the `aspect` key this build rejects. */
function withFrame(skit: Skit, brief: { aspect?: unknown }): Skit {
  if (aspectOfBrief(brief) !== "16:9") return skit;
  const meta = { ...(skit.meta && typeof skit.meta === "object" ? skit.meta : {}), width: FRAME["16:9"].width, height: FRAME["16:9"].height } as Record<string, unknown>;
  delete meta.aspect;
  return { ...skit, meta };
}

/**
 * The committed skit cut into `brief.scenes` scenes: its beats split evenly, never opening a
 * scene on a silent beat, each scene on the brief's next set, or else a set not yet used.
 */
function inScenes(skit: Skit & { set?: string; beats?: Beat[] }, brief: StickBrief & { scenes: number }): Skit {
  const beats = skit.beats ?? [];
  const pool = [...(brief.allowed_sets ?? Object.keys(stickRegistry.sets)), ...Object.keys(stickRegistry.sets)].filter((s) => s in stickRegistry.sets);
  const used: string[] = [];
  const scenes: Scene[] = [];
  let at = 0;
  for (let i = 0; i < brief.scenes && at < beats.length; i++) {
    let end = i === brief.scenes - 1 ? beats.length : Math.round(((i + 1) * beats.length) / brief.scenes);
    while (end < beats.length && !beats[end]!.line) end++;
    const set = brief.sets?.[i] ?? pool.find((s) => !used.includes(s) && !brief.sets?.includes(s)) ?? skit.set!;
    used.push(set);
    scenes.push({ id: `s${i + 1}`, set, beats: beats.slice(at, end) });
    at = end;
  }
  const out: Skit = { ...skit, scenes: scenes.filter((sc) => sc.beats.length > 0) };
  delete out.set;
  delete out.beats;
  return out;
}

/** What the script model "wrote": the committed skit for a draft, one changed line for a revise. */
function mockWrite(input: StickScriptIn): { skit: Skit; premise?: Record<string, unknown> } {
  if (input.mode === "draft") {
    const skit = clone(groupChat) as Skit & { set: string; beats?: Beat[] };
    const { scenes } = input.brief;
    if (scenes) return { skit: withFrame(inScenes(skit, { ...input.brief, scenes }), input.brief), premise: clone(premise) };
    const set = input.brief.set ?? input.brief.allowed_sets?.find((s) => s in stickRegistry.sets);
    if (set && set in stickRegistry.sets) skit.set = set;
    return { skit: withFrame(skit, input.brief), premise: clone(premise) };
  }
  // Revise "applies" the note to the punchline only, and keeps every id.
  const skit = clone(input.skit) as Skit & { beats?: Beat[]; scenes?: { beats?: Beat[] }[] };
  const spoken = (skit.scenes ? skit.scenes.flatMap((sc) => sc.beats ?? []) : (skit.beats ?? [])).filter((b) => b.line);
  const last = spoken.at(-1);
  if (last?.line) last.line = `${last.line.replace(/[.!?]+$/, "")}. Obviously.`;
  return { skit };
}

export function stickScriptOutput(input: StickScriptIn): StickScriptOut | StickMockFailure {
  if (input.catalog_version !== stickCatalog.version) return "catalog_mismatch";
  const { skit, premise: written } = mockWrite(input);
  try {
    const d = checkDraft(skitForEngine(skit), stickRegistry);
    return {
      ...(written ? { premise: written } : {}),
      skit,
      lines: d.lines.map((l) => ({ id: l.id, speaker: l.speaker, character: l.character, text: l.text, ...(l.delivery ? { delivery: l.delivery } : {}) })),
      estimated_duration_s: d.estimatedDurationSec,
      check: { ok: d.check.ok, errors: d.check.errors, warnings: d.check.warnings, findings: d.check.findings as Record<string, unknown>[] },
      warnings: d.warnings.map((w) => (w.path ? `${w.path}: ${w.message}` : w.message)),
    };
  } catch (e) {
    if (e instanceof SkitError) return "invalid_skit";
    throw e;
  }
}

let cannedMp4: Uint8Array | null = null;
/** Read on first use from the repo root (the worker and the dev server both run there). */
function mp4(): Uint8Array {
  cannedMp4 ??= new Uint8Array(readFileSync(path.join(process.cwd(), "src/lib/tamtree/mock/stick/group-chat.mp4")));
  return cannedMp4;
}

const srtTime = (ms: number) => {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor(ms / 60_000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
};

export type StickRenderFiles = { mp4: Uint8Array; srt: string; txt: string; manifest: string; durationS: number; reminder: string };

/** The render's files for an approved skit, or why the real flow would stop before any TTS. */
export function stickProduceFiles(input: StickProduceIn): StickRenderFiles | StickMockFailure {
  if (input.catalog_version !== stickCatalog.version) return "catalog_mismatch";
  let d: ReturnType<typeof checkDraft>;
  try {
    d = checkDraft(skitForEngine(input.skit), stickRegistry);
  } catch (e) {
    if (e instanceof SkitError) return "invalid_skit";
    throw e;
  }
  if (!d.ok) return "invalid_skit";
  let at = 0;
  const cues = placeholderVoice(d.lines).lines.map((l, i) => {
    const cue = `${i + 1}\n${srtTime(at)} --> ${srtTime(at + l.durationMs)}\n${l.text}\n`;
    at += l.durationMs + 250;
    return cue;
  });
  const meta = (input.skit.meta ?? {}) as { title?: string; description?: string; hashtags?: string[] };
  const reminder = "Label this as AI-voiced where the platform asks.";
  const txt = [meta.description ?? meta.title ?? "", (meta.hashtags ?? []).map((h) => `#${h}`).join(" ")].filter(Boolean).join("\n\n");
  const manifest = JSON.stringify({ title: meta.title ?? "", durationSec: d.estimatedDurationSec, lines: d.lines.length, voices: input.voices, reminder }, null, 1);
  return { mp4: mp4(), srt: cues.join("\n"), txt, manifest, durationS: d.estimatedDurationSec, reminder };
}

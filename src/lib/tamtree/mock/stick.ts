/**
 * The mock's `stick-script` / `stick-produce` (09 §7 K1.2). Staging and the self-check are
 * the real `stickstage` package, so what the mock returns is what the render service would
 * say about the same skit; only the model and the render are canned: the committed
 * `group-chat` skit, and a 270×480 cut of its render.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { checkDraft, placeholderVoice, SkitError } from "stickstage";

import { stickCatalog, stickRegistry } from "@/lib/stick/registry";
import type { Skit, StickProduceIn, StickScriptIn, StickScriptOut } from "../stage-flows";
import premise from "./stick/group-chat.premise.json";
import groupChat from "./stick/group-chat.skit.json";

export type StickMockFailure = "catalog_mismatch" | "invalid_skit";

type Beat = { id: string; speaker?: string; line?: string };

const clone = <T>(v: T): T => structuredClone(v);

/** What the script model "wrote": the committed skit for a draft, one changed line for a revise. */
function mockWrite(input: StickScriptIn): { skit: Skit; premise?: Record<string, unknown> } {
  if (input.mode === "draft") {
    const skit = clone(groupChat) as Skit & { set: string };
    const set = input.brief.set ?? input.brief.allowed_sets?.find((s) => s in stickRegistry.sets);
    if (set && set in stickRegistry.sets) skit.set = set;
    return { skit, premise: clone(premise) };
  }
  // Revise "applies" the note to the punchline only, and keeps every id.
  const skit = clone(input.skit) as Skit & { beats?: Beat[] };
  const spoken = (skit.beats ?? []).filter((b) => b.line);
  const last = spoken.at(-1);
  if (last?.line) last.line = `${last.line.replace(/[.!?]+$/, "")}. Obviously.`;
  return { skit };
}

export function stickScriptOutput(input: StickScriptIn): StickScriptOut | StickMockFailure {
  if (input.catalog_version !== stickCatalog.version) return "catalog_mismatch";
  const { skit, premise: written } = mockWrite(input);
  try {
    const d = checkDraft(skit, stickRegistry);
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
    d = checkDraft(input.skit, stickRegistry);
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

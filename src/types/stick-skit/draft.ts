/**
 * The skit review's in-process half (09 §6 step 4): judging a skit exactly as StickStage's
 * `/validate` would, and the beat edits the owner may make (OD-12: line, speaker, expression,
 * pause and text slams; shots, cuts and camera stay with the director). Pure and client-safe,
 * so the review screen re-checks every edit in the browser and the server re-checks it on save,
 * with no run either way.
 */
import { checkDraft, SkitError } from "stickstage";

import { stickRegistry } from "@/lib/stick/registry";
import type { Skit, StickCheck, StickLine } from "@/lib/tamtree/stage-flows";

export type SkitVerdict = {
  /** Exactly what `stick-produce` will voice, one TTS call each. Empty when the skit doesn't parse. */
  lines: StickLine[];
  check: StickCheck;
  /** Compile warnings, as the flow reports them (`path: message`). */
  warnings: string[];
  /** On placeholder timings; null when the skit doesn't parse. */
  estimatedDurationS: number | null;
};

/**
 * Spoken beats whose line is only spaces. The engine takes them (a string of length ≥ 1),
 * but TTS would voice silence at a line's price, so Studio's gate refuses them.
 */
function blankLines(skit: unknown): Record<string, unknown>[] {
  const beats = (skit as { beats?: unknown })?.beats;
  if (!Array.isArray(beats)) return [];
  return beats.flatMap((b: { line?: unknown; silent?: unknown }, i) =>
    b && b.silent !== true && typeof b.line === "string" && b.line.length > 0 && !b.line.trim()
      ? [{ check: "blank-line", level: "error", message: "This line is empty.", path: `beats[${i}].line` }]
      : [],
  );
}

export function judgeSkit(skit: unknown): SkitVerdict {
  try {
    const d = checkDraft(skit, stickRegistry);
    const blank = blankLines(skit);
    return {
      lines: d.lines.map((l) => ({ id: l.id, speaker: l.speaker, character: l.character, text: l.text, ...(l.delivery ? { delivery: l.delivery } : {}) })),
      check: {
        ok: d.check.ok && blank.length === 0,
        errors: d.check.errors + blank.length,
        warnings: d.check.warnings,
        findings: [...blank, ...d.check.findings],
      },
      warnings: d.warnings.map((w) => (w.path ? `${w.path}: ${w.message}` : w.message)),
      estimatedDurationS: d.estimatedDurationSec,
    };
  } catch (e) {
    if (!(e instanceof SkitError)) throw e;
    // A skit StickStage refuses outright: its diagnostics become the check's findings, and at
    // least one of them is an error, so the gate stays shut.
    const findings = e.diagnostics.map((d) => ({ check: d.code, level: d.level, message: d.message, path: d.path }));
    const errors = Math.max(1, findings.filter((f) => f.level === "error").length);
    return {
      lines: [],
      check: { ok: false, errors, warnings: findings.filter((f) => f.level === "warning").length, findings },
      warnings: [],
      estimatedDurationS: null,
    };
  }
}

/** The human gate: nothing to voice, or any error in the check, keeps Approve shut. */
export function canApprove(v: SkitVerdict): boolean {
  return v.check.ok && v.check.errors === 0 && v.lines.length > 0;
}

type RawBeat = Record<string, unknown> & { id: string };
type Slam = { type: "slam"; value: string } & Record<string, unknown>;

/** One beat as the editor shows it. */
export type EditableBeat = {
  id: string;
  silent: boolean;
  speaker?: string;
  line?: string;
  expression?: string;
  pauseBeforeMs?: number;
  slams: string[];
};

export type BeatPatch = {
  speaker?: string;
  line?: string;
  expression?: string;
  /** null removes the pause. */
  pauseBeforeMs?: number | null;
  slams?: string[];
};

function rawBeats(skit: Skit): RawBeat[] {
  const beats = skit.beats;
  if (!Array.isArray(beats)) throw new Error("This skit has no beats to edit.");
  return beats as RawBeat[];
}

const slamsOf = (beat: RawBeat): Slam[] => (Array.isArray(beat.text) ? (beat.text as Slam[]).filter((t) => t?.type === "slam") : []);

export function beatsOf(skit: Skit): EditableBeat[] {
  return rawBeats(skit).map((b) => ({
    id: b.id,
    silent: b.silent === true || typeof b.line !== "string",
    speaker: typeof b.speaker === "string" ? b.speaker : undefined,
    line: typeof b.line === "string" ? b.line : undefined,
    expression: typeof b.expression === "string" ? b.expression : undefined,
    pauseBeforeMs: typeof b.pauseBeforeMs === "number" ? b.pauseBeforeMs : undefined,
    slams: slamsOf(b).map((s) => s.value),
  }));
}

/** The skit's cast ids, in order: who a line can be given to. */
export function castOf(skit: Skit): { id: string; character: string; label?: string }[] {
  return Array.isArray(skit.cast) ? (skit.cast as { id: string; character: string; label?: string }[]) : [];
}

/**
 * A new skit with one beat changed. Everything the patch doesn't name (actions, shots, sfx,
 * timing anchors) is kept; a slam keeps its timing when only its words change.
 */
export function editBeat(skit: Skit, beatId: string, patch: BeatPatch): Skit {
  const beats = rawBeats(skit);
  if (!beats.some((b) => b.id === beatId)) throw new Error(`No beat "${beatId}" in this skit.`);
  return {
    ...skit,
    beats: beats.map((b) => {
      if (b.id !== beatId) return b;
      const next: RawBeat = { ...b };
      if (patch.speaker !== undefined) next.speaker = patch.speaker;
      if (patch.line !== undefined) next.line = patch.line;
      if (patch.expression !== undefined) next.expression = patch.expression;
      if (patch.pauseBeforeMs === null) delete next.pauseBeforeMs;
      else if (patch.pauseBeforeMs !== undefined) next.pauseBeforeMs = Math.max(0, Math.round(patch.pauseBeforeMs));
      if (patch.slams !== undefined) {
        const old = slamsOf(b);
        const others = Array.isArray(b.text) ? (b.text as Slam[]).filter((t) => t?.type !== "slam") : [];
        next.text = [...others, ...patch.slams.map((value, i) => (old[i] ? { ...old[i], value } : { type: "slam" as const, value }))];
      }
      return next;
    }),
  };
}

/**
 * What the server accepts from the editor: the stored skit with only its beats replaced
 * (OD-12), so cast, set, shots and meta can't be changed from the review screen.
 */
export function withBeats(stored: Skit, beats: unknown): Skit {
  if (!Array.isArray(beats)) throw new Error("Beats must be a list.");
  const storedIds = rawBeats(stored).map((b) => b.id);
  const ids = beats.map((b) => (b && typeof b === "object" && "id" in b ? (b as RawBeat).id : undefined));
  if (ids.length !== storedIds.length || ids.some((id, i) => id !== storedIds[i])) {
    throw new Error("Beats can be edited, not added, removed or reordered, here.");
  }
  return { ...stored, beats };
}

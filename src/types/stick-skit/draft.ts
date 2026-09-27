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

/** Every beat with its path, whether the skit keeps one list (`beats`) or one per scene (`scenes[].beats`). */
function locatedBeats(skit: unknown): { beat: unknown; path: string }[] {
  const doc = skit as { beats?: unknown; scenes?: unknown } | null;
  if (Array.isArray(doc?.scenes)) {
    return doc.scenes.flatMap((sc: { beats?: unknown }, i) =>
      Array.isArray(sc?.beats) ? sc.beats.map((beat, j) => ({ beat, path: `scenes[${i}].beats[${j}]` })) : [],
    );
  }
  return Array.isArray(doc?.beats) ? doc.beats.map((beat, i) => ({ beat, path: `beats[${i}]` })) : [];
}

/**
 * Spoken beats whose line is only spaces. The engine takes them (a string of length ≥ 1),
 * but TTS would voice silence at a line's price, so Studio's gate refuses them.
 */
function blankLines(skit: unknown): Record<string, unknown>[] {
  return locatedBeats(skit).flatMap(({ beat, path }) => {
    const b = beat as { line?: unknown; silent?: unknown } | null;
    return b && b.silent !== true && typeof b.line === "string" && b.line.length > 0 && !b.line.trim()
      ? [{ check: "blank-line", level: "error", message: "This line is empty.", path: `${path}.line` }]
      : [];
  });
}

/**
 * Where a finding points, in the editor's numbering: beats count from 1 across every scene.
 * `scenes[1].beats[0].line` in a skit whose first scene has 5 beats → `{ beat: 6, field: "line" }`.
 */
export function findingTarget(skit: unknown, path?: string): { beat: number; field?: string } | null {
  const m = path?.match(/^((?:scenes\[\d+\]\.)?beats\[\d+\])(?:\.(\w+))?/);
  if (!m) return null;
  const index = locatedBeats(skit).findIndex((b) => b.path === m[1]);
  return index < 0 ? null : { beat: index + 1, ...(m[2] ? { field: m[2] } : {}) };
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
type RawScene = Record<string, unknown> & { id: string; beats: RawBeat[] };
type Slam = { type: "slam"; value: string } & Record<string, unknown>;

/** One beat as the editor shows it. */
export type EditableBeat = {
  id: string;
  /** The scene it plays in; unset in a one-scene skit. */
  scene?: string;
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

/** A multi-scene skit's scenes (StickStage `scenes[]`), or null for one scene. */
function rawScenes(skit: Skit): RawScene[] | null {
  return Array.isArray(skit.scenes) ? (skit.scenes as RawScene[]) : null;
}

/** Every beat, in play order, across scenes. */
function rawBeats(skit: Skit): RawBeat[] {
  const scenes = rawScenes(skit);
  if (scenes) return scenes.flatMap((sc) => (Array.isArray(sc.beats) ? sc.beats : []));
  const beats = skit.beats;
  if (!Array.isArray(beats)) throw new Error("This skit has no beats to edit.");
  return beats as RawBeat[];
}

/** The skit with its beats replaced, in play order, keeping each scene's share of them. */
function replaceBeats(skit: Skit, beats: RawBeat[]): Skit {
  const scenes = rawScenes(skit);
  if (!scenes) return { ...skit, beats };
  let at = 0;
  return {
    ...skit,
    scenes: scenes.map((sc) => {
      const n = Array.isArray(sc.beats) ? sc.beats.length : 0;
      return { ...sc, beats: beats.slice(at, (at += n)) };
    }),
  };
}

/** The beats as the editor saves them: one list in play order, whatever the skit's shape. */
export function allBeats(skit: Skit): RawBeat[] {
  return rawBeats(skit);
}

export type SkitScene = { id: string; set?: string; pov?: string; card?: string; beatIds: string[] };

/** A multi-scene skit's scenes, for the editor's scene headings; empty for one scene. */
export function scenesOf(skit: Skit): SkitScene[] {
  return (rawScenes(skit) ?? []).map((sc) => {
    const set = typeof sc.set === "string" ? sc.set : typeof skit.set === "string" ? skit.set : undefined;
    const card = (sc.card as { title?: unknown } | undefined)?.title;
    return {
      id: sc.id,
      ...(set ? { set } : {}),
      ...(typeof sc.pov === "string" ? { pov: sc.pov } : {}),
      ...(typeof card === "string" ? { card } : {}),
      beatIds: (Array.isArray(sc.beats) ? sc.beats : []).map((b) => b.id),
    };
  });
}

const slamsOf = (beat: RawBeat): Slam[] => (Array.isArray(beat.text) ? (beat.text as Slam[]).filter((t) => t?.type === "slam") : []);

export function beatsOf(skit: Skit): EditableBeat[] {
  const sceneOf = new Map(scenesOf(skit).flatMap((sc) => sc.beatIds.map((id) => [id, sc.id] as const)));
  return rawBeats(skit).map((b) => ({
    id: b.id,
    ...(sceneOf.has(b.id) ? { scene: sceneOf.get(b.id) } : {}),
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
  return replaceBeats(
    skit,
    beats.map((b) => {
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
  );
}

/**
 * What the server accepts from the editor: the stored skit with only its beats replaced
 * (OD-12), so cast, sets, scenes, shots and meta can't be changed from the review screen.
 * `beats` is every beat in play order (`allBeats`); each scene keeps its own.
 */
export function withBeats(stored: Skit, beats: unknown): Skit {
  if (!Array.isArray(beats)) throw new Error("Beats must be a list.");
  const storedIds = rawBeats(stored).map((b) => b.id);
  const ids = beats.map((b) => (b && typeof b === "object" && "id" in b ? (b as RawBeat).id : undefined));
  if (ids.length !== storedIds.length || ids.some((id, i) => id !== storedIds[i])) {
    throw new Error("Beats can be edited, not added, removed or reordered, here.");
  }
  return replaceBeats(stored, beats as RawBeat[]);
}

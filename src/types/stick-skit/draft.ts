/**
 * The skit review's in-process half (09 §6 step 4): judging a skit exactly as StickStage's
 * `/validate` would, and the beat edits the owner may make (OD-12: line, speaker, expression,
 * pause and text slams; shots, cuts and camera stay with the director). Pure and client-safe,
 * so the review screen re-checks every edit in the browser and the server re-checks it on save,
 * with no run either way.
 */
import { checkDraft, lastWordAnchor, normWord, SkitError, tokenize } from "stickstage";

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
 * but TTS would voice silence at a line's price, so t-shoot's gate refuses them.
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
    const slams = slamAnchorFindings(skit);
    return {
      lines: d.lines.map((l) => ({ id: l.id, speaker: l.speaker, character: l.character, text: l.text, ...(l.delivery ? { delivery: l.delivery } : {}) })),
      check: {
        ok: d.check.ok && blank.length === 0,
        errors: d.check.errors + blank.length,
        warnings: d.check.warnings + slams.length,
        findings: [...blank, ...slams, ...d.check.findings],
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
  /** The word each slam hits, when it is anchored to a word. */
  slamAt: ({ word: string; occurrence: number } | null)[];
  /** The first sound effect on the beat, or none. */
  sfx: string | null;
};

export type BeatPatch = {
  speaker?: string;
  line?: string;
  expression?: string;
  /** null removes the pause. */
  pauseBeforeMs?: number | null;
  slams?: string[];
  /**
   * Word anchors parallel to `slams`. A null entry lets the editor pick the anchor.
   * Set when the person double-taps a word, so the slam hits that occurrence.
   */
  slamAnchors?: ({ word: string; occurrence: number } | null)[];
  /** null clears the effect. Unset leaves it. */
  sfx?: string | null;
};

/** Which scene each beat plays in, when the skit has more than one. */
export type ScenePlan = { id: string; set?: string; beatIds: string[] };

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

/** The first place `value`'s words appear in the line, or null. */
function phraseAnchor(line: string, value: string): { word: string; occurrence: number } | null {
  const lineToks = tokenize(line);
  const want = tokenize(value).map((t) => t.norm).filter(Boolean);
  if (want.length === 0 || lineToks.length < want.length) return null;
  for (let i = 0; i <= lineToks.length - want.length; i++) {
    if (want.every((n, j) => lineToks[i + j]!.norm === n)) {
      const hit = lineToks[i]!;
      const occurrence = lineToks.slice(0, i + 1).filter((t) => t.norm === hit.norm).length;
      return { word: hit.norm || hit.text, occurrence };
    }
  }
  return null;
}

/** Point a slam at its own words, or at the last word of the line when those words are gone. */
function retargetSlam(slam: Slam, line: string): Slam {
  const phrase = phraseAnchor(line, slam.value);
  if (phrase) return { ...slam, at: phrase };
  if (tokenize(line).length === 0) return slam;
  return { ...slam, at: lastWordAnchor(line) };
}

function slamDisagrees(slam: Slam): boolean {
  const at = slam.at as { word?: unknown } | undefined;
  if (!at || typeof at.word !== "string") return false;
  const norms = tokenize(slam.value).map((t) => t.norm).filter(Boolean);
  return !norms.includes(normWord(at.word));
}

/** The chip says one thing and the film hits another word. A warning: the line still plays. */
function slamAnchorFindings(skit: unknown): Record<string, unknown>[] {
  return locatedBeats(skit).flatMap(({ beat, path }) => {
    const b = beat as RawBeat | null;
    if (!b) return [];
    return slamsOf(b).flatMap((slam) =>
      slamDisagrees(slam)
        ? [{ check: "slam-anchor", level: "warning", message: `The slam “${slam.value}” still hits “${(slam.at as { word: string }).word}”.`, path: `${path}.text` }]
        : [],
    );
  });
}

function spoken(beat: RawBeat): boolean {
  return beat.silent !== true && typeof beat.line === "string" && beat.line.trim().length > 0;
}

type Slot = { sceneId: string; beat: RawBeat };

function slotsOf(skit: Skit): { scenes: RawScene[] | null; slots: Slot[] } {
  const scenes = rawScenes(skit);
  if (!scenes) return { scenes: null, slots: rawBeats(skit).map((beat) => ({ sceneId: "", beat })) };
  return { scenes, slots: scenes.flatMap((sc) => (Array.isArray(sc.beats) ? sc.beats : []).map((beat) => ({ sceneId: sc.id, beat }))) };
}

function fromSlots(skit: Skit, scenes: RawScene[] | null, slots: Slot[]): Skit {
  if (!scenes) return { ...skit, beats: slots.map((s) => s.beat) };
  const next = scenes
    .map((sc) => ({ ...sc, beats: slots.filter((s) => s.sceneId === sc.id).map((s) => s.beat) }))
    .filter((sc) => sc.beats.length > 0);
  const { beats: _omit, ...rest } = skit as Skit & { beats?: unknown };
  return { ...rest, scenes: next };
}

/** Move `from` so it lands at `to` in the list after the removal. `to` is the original index to occupy. */
function relocate<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item!);
  return next;
}

function takenIds(skit: Skit): Set<string> {
  const ids = new Set(rawBeats(skit).map((b) => b.id));
  for (const sc of rawScenes(skit) ?? []) ids.add(sc.id);
  return ids;
}

function freshId(prefix: string, taken: Set<string>): string {
  let id = "";
  do id = prefix + Math.random().toString(36).slice(2, 8);
  while (taken.has(id) || !/^[a-z][a-z0-9]*$/.test(id));
  return id;
}

function blankBeat(id: string, speaker?: string): RawBeat {
  return { id, ...(speaker ? { speaker } : {}), line: " ", expression: "neutral" };
}

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
    slamAt: slamsOf(b).map((s) => {
      const at = s.at as { word?: unknown; occurrence?: unknown } | undefined;
      return at && typeof at.word === "string" ? { word: normWord(at.word), occurrence: typeof at.occurrence === "number" ? at.occurrence : 1 } : null;
    }),
    sfx: sfxId(b),
  }));
}

function sfxId(beat: RawBeat): string | null {
  const sfx = beat.sfx;
  if (!Array.isArray(sfx) || sfx.length === 0) return null;
  const id = (sfx[0] as { id?: unknown } | null)?.id;
  return typeof id === "string" ? id : null;
}

/** The skit's cast ids, in order: who a line can be given to. */
export function castOf(skit: Skit): { id: string; character: string; label?: string }[] {
  return Array.isArray(skit.cast) ? (skit.cast as { id: string; character: string; label?: string }[]) : [];
}

/**
 * A new skit with one beat changed. Everything the patch doesn't name (actions, shots)
 * is kept, including sfx unless the patch names one. A slam keeps its timing when only
 * its words change and those words are not in the line. Changing the line retargets
 * every slam: onto its own words, or the last word.
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
      if (patch.sfx === null) delete next.sfx;
      else if (patch.sfx !== undefined) {
        const prev = Array.isArray(b.sfx) ? (b.sfx as { id?: string }[]) : [];
        const kept = prev.find((s) => s?.id === patch.sfx);
        next.sfx = [kept ? { ...kept, id: patch.sfx } : { id: patch.sfx, at: { ms: 0 } }];
      }
      const line = typeof next.line === "string" ? next.line : undefined;
      if (patch.slams !== undefined) {
        const old = slamsOf(b);
        const others = Array.isArray(b.text) ? (b.text as Slam[]).filter((t) => t?.type !== "slam") : [];
        next.text = [
          ...others,
          ...patch.slams.map((value, i) => {
            const prev = old[i];
            const slam: Slam = prev ? { ...prev, value } : { type: "slam", value };
            const pinned = patch.slamAnchors?.[i];
            if (pinned) return { ...slam, at: pinned };
            if (!line) return slam;
            if (!prev || patch.line !== undefined) return retargetSlam(slam, line);
            if (value !== prev.value && phraseAnchor(line, value)) return retargetSlam(slam, line);
            return slam;
          }),
        ];
      } else if (patch.line !== undefined && line) {
        const slams = slamsOf(next);
        if (slams.length) {
          const others = Array.isArray(next.text) ? (next.text as Slam[]).filter((t) => t?.type !== "slam") : [];
          next.text = [...others, ...slams.map((s) => retargetSlam(s, line))];
        }
      }
      return next;
    }),
  );
}

/**
 * Rewrite slam anchors that no longer name the slam's own words. The editor does this
 * when a draft opens, so a line edited earlier stops firing on the old word.
 */
export function alignSlams(skit: Skit): { skit: Skit; changed: boolean } {
  let next = skit;
  let changed = false;
  for (const beat of rawBeats(skit)) {
    if (typeof beat.line !== "string") continue;
    const slams = slamsOf(beat);
    if (!slams.some(slamDisagrees)) continue;
    next = editBeat(next, beat.id, { line: beat.line, slams: slams.map((s) => s.value) });
    changed = true;
  }
  return { skit: next, changed };
}

/** Where each beat sits, for a save of a multi-scene skit. Undefined for one scene. */
export function scenePlanOf(skit: Skit): ScenePlan[] | undefined {
  const scenes = scenesOf(skit);
  if (scenes.length === 0) return undefined;
  return scenes.map((sc) => ({ id: sc.id, ...(sc.set ? { set: sc.set } : {}), beatIds: sc.beatIds }));
}

function parseIncoming(beats: unknown): RawBeat[] {
  if (!Array.isArray(beats)) throw new Error("Beats must be a list.");
  const incoming = beats.map((b) => {
    if (!b || typeof b !== "object" || typeof (b as RawBeat).id !== "string" || !(b as RawBeat).id) throw new Error("Each beat needs an id.");
    return b as RawBeat;
  });
  if (new Set(incoming.map((b) => b.id)).size !== incoming.length) throw new Error("Each beat needs its own id.");
  if (!incoming.some(spoken)) throw new Error("Keep at least one spoken line.");
  return incoming;
}

/**
 * What the server accepts from the editor: the stored skit with its beats replaced.
 * Lines can be added, removed, and reordered. Cast and meta stay. A multi-scene skit
 * needs `scenePlan` so each line still belongs to a scene. The last spoken line cannot go.
 */
export function withBeats(stored: Skit, beats: unknown, scenePlan?: ScenePlan[]): Skit {
  const incoming = parseIncoming(beats);
  const byId = new Map(incoming.map((b) => [b.id, b]));
  const scenes = rawScenes(stored);
  if (!scenes) {
    if (scenePlan && scenePlan.length > 1) return applyScenePlan(stored, byId, incoming, scenePlan);
    return { ...stored, beats: incoming };
  }
  const plan = scenePlan ?? planIfUnchanged(scenes, incoming);
  return applyScenePlan(stored, byId, incoming, plan);
}

/** Same beats, same scenes: the older callers that only edited words. */
function planIfUnchanged(scenes: RawScene[], incoming: RawBeat[]): ScenePlan[] {
  const storedIds = scenes.flatMap((sc) => sc.beats.map((b) => b.id));
  const ids = incoming.map((b) => b.id);
  if (ids.length === storedIds.length && ids.every((id, i) => id === storedIds[i])) {
    return scenes.map((sc) => ({
      id: sc.id,
      ...(typeof sc.set === "string" ? { set: sc.set } : {}),
      beatIds: sc.beats.map((b) => b.id),
    }));
  }
  throw new Error("Say which scene each line plays in.");
}

function applyScenePlan(stored: Skit, byId: Map<string, RawBeat>, incoming: RawBeat[], plan: ScenePlan[]): Skit {
  const known = new Map((rawScenes(stored) ?? []).map((sc) => [sc.id, sc]));
  const sets = stickRegistry.sets;
  if (!plan.length) throw new Error("A skit needs a scene.");
  const seen = new Set<string>();
  const scenes = plan.map((p) => {
    if (!p || typeof p.id !== "string" || !p.id) throw new Error("Each scene needs an id.");
    if (!Array.isArray(p.beatIds) || p.beatIds.length === 0) throw new Error("A scene needs a line.");
    const prev = known.get(p.id);
    const set = p.set ?? (typeof prev?.set === "string" ? prev.set : typeof stored.set === "string" ? stored.set : undefined);
    if (set && !sets[set]) throw new Error(`That set isn't in the catalog.`);
    const beats = p.beatIds.map((id) => {
      if (seen.has(id)) throw new Error("A line can't play in two scenes.");
      seen.add(id);
      const beat = byId.get(id);
      if (!beat) throw new Error("A scene names a line that isn't in the skit.");
      return beat;
    });
    return { ...(prev ?? { id: p.id }), id: p.id, ...(set ? { set } : {}), beats };
  });
  if (seen.size !== incoming.length) throw new Error("Every line has to belong to a scene.");
  const { beats: _omit, set: _set, ...rest } = stored as Skit & { beats?: unknown; set?: unknown };
  return { ...rest, scenes } as Skit;
}

/** A new spoken line after `afterId` (or at the start when `afterId` is null). Same scene, previous speaker. */
export function addBeat(skit: Skit, afterId: string | null): { skit: Skit; id: string } {
  const { scenes, slots } = slotsOf(skit);
  const after = afterId === null ? -1 : slots.findIndex((s) => s.beat.id === afterId);
  if (afterId !== null && after < 0) throw new Error(`No beat "${afterId}" in this skit.`);
  const neighbor = slots[after] ?? slots[0];
  const speaker = (typeof neighbor?.beat.speaker === "string" ? neighbor.beat.speaker : undefined) ?? castOf(skit)[0]?.id;
  const id = freshId("b", takenIds(skit));
  const slot: Slot = { sceneId: neighbor?.sceneId ?? "", beat: blankBeat(id, speaker) };
  const next = slots.slice();
  next.splice(after + 1, 0, slot);
  return { skit: fromSlots(skit, scenes, next), id };
}

/** A copy of a line, without its shot, so the director stages the copy. */
export function duplicateBeat(skit: Skit, beatId: string): { skit: Skit; id: string } {
  const { scenes, slots } = slotsOf(skit);
  const at = slots.findIndex((s) => s.beat.id === beatId);
  if (at < 0) throw new Error(`No beat "${beatId}" in this skit.`);
  const source = slots[at]!.beat;
  const id = freshId("b", takenIds(skit));
  const slams = slamsOf(source);
  const beat: RawBeat = {
    id,
    ...(typeof source.speaker === "string" ? { speaker: source.speaker } : {}),
    ...(typeof source.line === "string" ? { line: source.line } : { line: " " }),
    ...(typeof source.expression === "string" ? { expression: source.expression } : {}),
    ...(typeof source.pauseBeforeMs === "number" ? { pauseBeforeMs: source.pauseBeforeMs } : {}),
    ...(slams.length ? { text: slams.map((s) => ({ ...s })) } : {}),
    ...(Array.isArray(source.sfx) ? { sfx: (source.sfx as unknown[]).map((s) => ({ ...(s as object) })) } : {}),
  };
  const next = slots.slice();
  next.splice(at + 1, 0, { sceneId: slots[at]!.sceneId, beat });
  return { skit: fromSlots(skit, scenes, next), id };
}

/** Drop a line. The last spoken line stays, with a reason. */
export function deleteBeat(skit: Skit, beatId: string): Skit {
  const { scenes, slots } = slotsOf(skit);
  const at = slots.findIndex((s) => s.beat.id === beatId);
  if (at < 0) throw new Error(`No beat "${beatId}" in this skit.`);
  const beat = slots[at]!.beat;
  const spokenLeft = slots.filter((s) => s.beat.id !== beatId && spoken(s.beat)).length;
  if (spoken(beat) && spokenLeft === 0) throw new Error("Keep at least one spoken line.");
  if (slots.length === 1) throw new Error("Keep at least one line.");
  const next = slots.slice();
  next.splice(at, 1);
  return fromSlots(skit, scenes, next);
}

/** Swap a line with its neighbor. Across a scene boundary, the line joins that scene. */
export function moveBeat(skit: Skit, beatId: string, direction: "up" | "down"): Skit {
  const { slots } = slotsOf(skit);
  const from = slots.findIndex((s) => s.beat.id === beatId);
  if (from < 0) throw new Error(`No beat "${beatId}" in this skit.`);
  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= slots.length) return skit;
  return placeBeat(skit, beatId, to);
}

/** Land `beatId` on `toIndex` (the index it should occupy). */
export function placeBeat(skit: Skit, beatId: string, toIndex: number): Skit {
  const { scenes, slots } = slotsOf(skit);
  const from = slots.findIndex((s) => s.beat.id === beatId);
  if (from < 0) throw new Error(`No beat "${beatId}" in this skit.`);
  if (toIndex === from) return skit;
  const host = slots[Math.max(0, Math.min(toIndex, slots.length - 1))];
  const moved: Slot = { ...slots[from]!, sceneId: host?.sceneId ?? slots[from]!.sceneId };
  const next = relocate(slots, from, toIndex);
  next[next.findIndex((s) => s.beat.id === beatId)] = moved;
  return fromSlots(skit, scenes, next);
}

/** A new scene after `afterSceneId`, with one blank line, on `setId`. */
export function addScene(skit: Skit, afterSceneId: string | null, setId: string): { skit: Skit; id: string } {
  if (!stickRegistry.sets[setId]) throw new Error("That set isn't in the catalog.");
  const scenes = rawScenes(skit);
  const id = freshId("s", takenIds(skit));
  const speaker = castOf(skit)[0]?.id;
  const scene: RawScene = { id, set: setId, beats: [blankBeat(freshId("b", takenIds(skit)), speaker)] };
  if (!scenes) {
    const first: RawScene = {
      id: freshId("s", new Set([id, ...takenIds(skit)])),
      ...(typeof skit.set === "string" ? { set: skit.set } : { set: setId }),
      beats: rawBeats(skit),
    };
    const { beats: _b, set: _s, ...rest } = skit as Skit & { beats?: unknown; set?: unknown };
    return { skit: { ...rest, scenes: [first, scene] } as Skit, id };
  }
  const at = afterSceneId === null ? -1 : scenes.findIndex((sc) => sc.id === afterSceneId);
  if (afterSceneId !== null && at < 0) throw new Error(`No scene "${afterSceneId}" in this skit.`);
  const next = scenes.slice();
  next.splice(at + 1, 0, scene);
  return { skit: { ...skit, scenes: next }, id };
}

/** Drop a scene and its lines. The last scene, and the last spoken line, stay. */
export function dropScene(skit: Skit, sceneId: string): Skit {
  const scenes = rawScenes(skit);
  if (!scenes) throw new Error("This skit has one scene.");
  if (scenes.length === 1) throw new Error("Keep at least one scene.");
  const scene = scenes.find((sc) => sc.id === sceneId);
  if (!scene) throw new Error(`No scene "${sceneId}" in this skit.`);
  const left = scenes.filter((sc) => sc.id !== sceneId).flatMap((sc) => sc.beats);
  if (!left.some(spoken)) throw new Error("Keep at least one spoken line.");
  return { ...skit, scenes: scenes.filter((sc) => sc.id !== sceneId) };
}

export function moveScene(skit: Skit, sceneId: string, direction: "up" | "down"): Skit {
  const scenes = rawScenes(skit);
  if (!scenes) return skit;
  const from = scenes.findIndex((sc) => sc.id === sceneId);
  if (from < 0) throw new Error(`No scene "${sceneId}" in this skit.`);
  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= scenes.length) return skit;
  const next = scenes.slice();
  const [scene] = next.splice(from, 1);
  next.splice(to, 0, scene!);
  return { ...skit, scenes: next };
}

/** Change the set a scene is filmed on. One-scene skits use the top-level set. */
export function setSceneSet(skit: Skit, sceneId: string | null, setId: string): Skit {
  if (!stickRegistry.sets[setId]) throw new Error("That set isn't in the catalog.");
  const scenes = rawScenes(skit);
  if (!scenes) return { ...skit, set: setId };
  if (!scenes.some((sc) => sc.id === sceneId)) throw new Error(`No scene "${sceneId}" in this skit.`);
  return { ...skit, scenes: scenes.map((sc) => (sc.id === sceneId ? { ...sc, set: setId } : sc)) };
}

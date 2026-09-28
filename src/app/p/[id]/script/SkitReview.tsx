"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { normWord } from "stickstage";

import { hooksAction, musicAction, tidyAction } from "@/app/horizon-actions";
import { SpeakButton } from "@/components/SpeakButton";
import { SfxChip } from "@/components/SfxChip";
import { MUSIC_BEDS } from "@/lib/music";
import { Face } from "@/components/stick-skit/Face";
import { fitFrame } from "@/components/stick-skit/fit";
import { ASPECT_LABEL, FRAME, frameClass, type Aspect } from "@/lib/stick/frame";
import { SetPicker } from "@/components/stick-skit/SetPicker";
import { CameraStrip } from "@/components/stick-skit/CameraStrip";
import { SkitPreview, type BeatSpan } from "@/components/stick-skit/SkitPreview";
import { useElementSize } from "@/components/stick-skit/useElementSize";
import { STICK_SCRIPT_PRICE_USD } from "@/lib/estimate";
import { stripEmphasis } from "@/lib/emphasis";
import { failureNotice, studioState } from "@/lib/run-state";
import { stickCatalog } from "@/lib/stick/registry";
import { isTerminal } from "@/lib/tamtree/types";
import type { Skit } from "@/lib/tamtree/stage-flows";
import type { ProduceState } from "@/services/skit";
import { estimateProduce } from "@/types/stick-skit";
import { characterAspect, characterName, setLabel } from "@/types/stick-skit/catalog";
import {
  addBeat,
  addScene,
  alignSlams,
  allBeats,
  beatsOf,
  canApprove,
  castOf,
  deleteBeat,
  dropScene,
  duplicateBeat,
  editBeat,
  findingTarget,
  judgeSkit,
  moveBeat,
  moveScene,
  placeBeat,
  scenePlanOf,
  scenesOf,
  setSceneSet,
  type BeatPatch,
  type EditableBeat,
  type SkitScene,
} from "@/types/stick-skit/draft";
import { BrandFrame } from "@/components/BrandFrame";
import type { BrandKit } from "@/lib/brand";
import { approveSkitAction, keepSkitRevisionAction, reviseSkitAction, saveSkitBeatsAction, undoSkitRevisionAction } from "./actions";

const SAVE_AFTER_MS = 600;
const label = "text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase";

type SaveState = "saved" | "saving" | "unsaved" | "failed";
type Finding = { check?: string; level?: string; message?: string; path?: string };

function where(skit: Skit, path?: string): string | null {
  const t = findingTarget(skit, path);
  if (!t) return null;
  const field = t.field === "pauseBeforeMs" ? "pause" : t.field === "text" ? "text slam" : t.field;
  return `Beat ${t.beat}${field ? `, ${field}` : ""}`;
}

function clockTime(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

/**
 * The skit review. The film is the rail. The script is a sequence of performances.
 * Nothing is spent until Approve, which stays shut while the check has errors.
 */
export function SkitReview({
  projectId,
  topic,
  skit: initial,
  limitUsd,
  warnings,
  voices,
  targetS,
  revisionNote,
  produce,
  fromComment,
  setOptions,
  shape,
  focusFraction,
  origin,
  musicBed,
  musicVolume,
  previewFont,
  brand,
}: {
  projectId: string;
  topic: string;
  skit: Skit;
  limitUsd: string;
  warnings: string[];
  voices: Record<string, string>;
  targetS?: 15 | 30 | 45 | 60;
  revisionNote: string | null;
  produce: ProduceState | null;
  fromComment: { id: string; note: string } | null;
  setOptions: { id: string; label: string }[];
  /** Short or widescreen. The preview box and the character menu follow it. */
  shape: Aspect;
  /** 0–1, from a review comment. Seeks the preview and opens that beat. */
  focusFraction: number | null;
  origin?: string;
  musicBed?: string | null;
  musicVolume?: number | null;
  previewFont?: string;
  brand?: BrandKit | null;
}) {
  const router = useRouter();
  const opened = useMemo(() => {
    const aligned = alignSlams(initial);
    let next = aligned.skit;
    let changed = aligned.changed;
    for (const beat of beatsOf(next)) {
      if (!beat.line) continue;
      const line = stripEmphasis(beat.line);
      if (line === beat.line) continue;
      next = editBeat(next, beat.id, { line });
      changed = true;
    }
    return { skit: next, changed };
  }, [initial]);
  const [skit, setSkit] = useState(opened.skit);
  const [save, setSave] = useState<SaveState>(opened.changed ? "unsaved" : "saved");
  const [savedAt, setSavedAt] = useState<Date | null>(opened.changed ? null : new Date());
  const [slamFixed, setSlamFixed] = useState(opened.changed);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState(fromComment?.note ?? "");
  const [sourceComment, setSourceComment] = useState(fromComment?.id);
  const [openId, setOpenId] = useState<string | null>(null);
  const [frame, setFrame] = useState(0);
  const [spans, setSpans] = useState<BeatSpan[]>([]);
  const [duration, setDuration] = useState(0);
  const [seek, setSeek] = useState<{ frame: number; nonce: number } | null>(null);
  const [undoCount, setUndoCount] = useState(0);
  const [sound, setSound] = useState(false);
  const [bed, setBed] = useState(musicBed ?? "");
  const [bedVolume, setBedVolume] = useState(musicVolume ?? 0.25);
  const [hooks, setHooks] = useState<string[] | null>(null);
  const [busy, startBusy] = useTransition();
  const [approving, startApprove] = useTransition();

  const verdict = useMemo(() => judgeSkit(skit), [skit]);
  const beats = useMemo(() => beatsOf(skit), [skit]);
  const scenes = useMemo(() => scenesOf(skit), [skit]);
  const cast = castOf(skit);
  const estimate = estimateProduce(verdict.lines.length);
  const making = !!produce && !isTerminal(produce.status);
  const approvable = canApprove(verdict) && !making;
  const findings = (verdict.check.findings as Finding[]).filter((f) => f.level === "error" || f.level === "warning");
  const errors = findings.filter((f) => f.level === "error");
  const playing = (spans.find((s) => frame >= s.from && frame < s.to) ?? [...spans].reverse().find((s) => s.from <= frame) ?? spans[0])?.id ?? null;

  const latest = useRef<Skit | null>(opened.changed ? opened.skit : null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const past = useRef<Skit[]>([]);
  const skitRef = useRef(skit);
  const openRef = useRef(openId);
  const soughtComment = useRef(false);
  useEffect(() => {
    skitRef.current = skit;
    openRef.current = openId;
  }, [skit, openId]);

  const [stageRef, stageSize] = useElementSize();
  const fitted = fitFrame(stageSize.width, Math.max(0, stageSize.height), shape);

  async function flush(): Promise<boolean> {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const pending = latest.current;
    if (!pending) return true;
    latest.current = null;
    setSave("saving");
    const multi = Array.isArray((pending as { scenes?: unknown[] }).scenes) && (pending as { scenes: unknown[] }).scenes.length > 0;
    const setId = typeof (pending as { set?: unknown }).set === "string" ? (pending as { set: string }).set : null;
    let result: { ok: true; errors: number } | { ok: false; error: string };
    try {
      result = await saveSkitBeatsAction(projectId, allBeats(pending), scenePlanOf(pending), {
        ...(multi ? {} : { set: setId }),
        cast: castOf(pending),
      });
    } catch (err) {
      latest.current = pending;
      setSave("failed");
      setError(err instanceof Error ? err.message : "Something went wrong saving the skit.");
      return false;
    }
    if (!result.ok) {
      latest.current = pending;
      setSave("failed");
      setError(result.error);
      return false;
    }
    setSlamFixed(false);
    setSavedAt(new Date());
    setSave(latest.current ? "unsaved" : "saved");
    return true;
  }

  function mark(next: Skit) {
    latest.current = next;
    setSave("unsaved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_AFTER_MS);
  }

  function commit(next: Skit) {
    past.current = [...past.current, skitRef.current].slice(-50);
    setUndoCount(past.current.length);
    setSkit(next);
    mark(next);
  }

  function undoLocal() {
    const prev = past.current.pop();
    setUndoCount(past.current.length);
    if (!prev) return;
    setSkit(prev);
    mark(prev);
  }

  function edit(beatId: string, patch: BeatPatch) {
    commit(editBeat(skitRef.current, beatId, patch));
  }

  function reshape(run: () => { skit: Skit; id?: string }, selectNew = false) {
    setError(null);
    try {
      const result = run();
      commit(result.skit);
      if (selectNew && result.id) {
        setOpenId(result.id);
        jump(result.id, result.skit);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "That edit didn’t stick.");
    }
  }

  function jump(beatId: string, source: Skit = skitRef.current) {
    setOpenId(beatId);
    const span = spans.find((s) => s.id === beatId);
    const frameAt = span ? span.from : (() => {
      const order = beatsOf(source);
      const index = order.findIndex((b) => b.id === beatId);
      return index >= 0 && duration > 0 ? Math.round((index / order.length) * duration) : null;
    })();
    if (frameAt !== null) setSeek((prev) => ({ frame: frameAt, nonce: (prev?.nonce ?? 0) + 1 }));
  }

  useEffect(() => {
    if (save !== "unsaved" || !latest.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_AFTER_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // `flush` closes over the latest editor state; `skit` is the signal that state changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save, skit]);

  const onSpans = useCallback((next: BeatSpan[], dur: number) => {
    setSpans(next);
    setDuration(dur);
  }, []);
  const onFrame = useCallback((n: number) => setFrame(n), []);

  useEffect(() => {
    if (soughtComment.current || focusFraction == null || spans.length === 0 || duration <= 0) return;
    soughtComment.current = true;
    const frameAt = Math.min(duration - 1, Math.round(focusFraction * duration));
    const span = spans.find((s) => frameAt >= s.from && frameAt < s.to) ?? spans[0]!;
    setOpenId(span.id);
    setSeek({ frame: span.from, nonce: 1 });
  }, [focusFraction, spans, duration]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void flush();
        return;
      }
      const id = openRef.current;
      if (e.altKey && id && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        reshape(() => ({ skit: moveBeat(skitRef.current, id, e.key === "ArrowUp" ? "up" : "down") }));
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        const target = e.target as HTMLElement | null;
        if (target?.closest("textarea, input")) return;
        e.preventDefault();
        undoLocal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) {
    setError(null);
    startBusy(async () => {
      if (!(await flush())) return;
      const result = await action();
      if (result.ok) after?.();
      else setError(result.error);
    });
  }

  function approve() {
    setError(null);
    startApprove(async () => {
      if (!(await flush())) return;
      const result = await approveSkitAction(projectId);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  const saveWord = save === "saving" ? "Saving…" : save === "unsaved" ? "Unsaved" : save === "failed" ? "Not saved" : savedAt ? `Saved ${clockTime(savedAt)}` : "Saved";
  const statusWord =
    errors.length > 0 ? `${errors.length} ${errors.length === 1 ? "problem" : "problems"}` : findings.length > 0 ? "Worth a look" : "No problems";
  const seconds = duration > 0 ? Math.max(1, Math.round(duration / 30)) : null;
  const spoken = beats.map((b) => b.line?.trim()).filter(Boolean).join(" ");
  const previewVoice = voices[cast[0]?.character ?? ""] ?? "Puck";

  return (
    <div className="flex min-h-0 flex-1 bg-canvas-script">
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="border-b border-rule px-6 pt-5 pb-3">
          <h1 className="font-display text-[32px] leading-[1.05] tracking-[-0.01em]">{topic}</h1>
          <p className="mt-1.5 text-[13px] text-fg-muted">
            {beats.length} {beats.length === 1 ? "line" : "lines"}
            {scenes.length > 1 ? ` · ${scenes.length} scenes` : ""}
            {scenes.length <= 1 && scenes[0]?.set ? ` · ${setLabel(scenes[0].set)}` : ""}
            {scenes.length === 0 && typeof (skit as { set?: unknown }).set === "string" ? ` · ${setLabel((skit as { set: string }).set)}` : ""}
            {` · ${ASPECT_LABEL[shape]} ${FRAME[shape].width}×${FRAME[shape].height}`}
            {seconds != null ? ` · about ${seconds}s` : ""}
            {targetS ? ` of ${targetS}s` : ""}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" disabled={undoCount === 0} onClick={undoLocal} className="h-9 rounded-lg px-2.5 text-[13px] text-fg-2 hover:bg-hover disabled:opacity-30">
              Undo
            </button>
            {scenes.length <= 1 && setOptions.length > 1 && (
              <SetPicker
                value={typeof (skit as { set?: unknown }).set === "string" ? (skit as { set: string }).set : ""}
                options={setOptions}
                label="Set"
                onChange={(setId) => reshape(() => ({ skit: setSceneSet(skit, null, setId) }))}
              />
            )}
            {cast.map((member) => (
              <label key={member.id} className="flex items-center gap-1.5 text-[12px] text-fg-muted">
                {member.label ? <span>{member.label}</span> : null}
                <select
                  aria-label={`Character for ${member.label ?? member.id}`}
                  value={member.character}
                  onChange={(e) => {
                    const next = cast.map((c) => (c.id === member.id ? { ...c, character: e.target.value } : c));
                    reshape(() => ({ skit: { ...skit, cast: next } }));
                  }}
                  className="h-9 rounded-lg border border-line bg-panel px-2 text-[13px] text-fg"
                >
                  {stickCatalog.characters.filter((c) => characterAspect(c.id) === shape || c.id === member.character).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
            ))}
            <span className="min-w-2 flex-1" />
            <button
              type="button"
              disabled={busy}
              title="Ask the writer to adjust the lines for the current cast and set"
              onClick={() => run(() => reviseSkitAction(projectId, "Adjust the lines for the current cast and set.", sourceComment))}
              className="flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-[13px] text-fg-2 disabled:opacity-50"
            >
              Adjust lines
              <span className="font-mono text-[11px] text-fg-muted">up to ${STICK_SCRIPT_PRICE_USD.toFixed(2)}</span>
            </button>
          </div>
        </div>

        {revisionNote && (
          <div className="mx-6 mb-3 flex items-center gap-3 rounded-[10px] border border-changed-pill-bg bg-changed-bg px-4 py-3">
            <span className="rounded-full bg-changed-pill-bg px-2 py-0.5 text-[11px] font-semibold text-changed-pill-fg">Changed by your note</span>
            <span className="flex-1 truncate text-[13px] text-fg-2">&ldquo;{revisionNote}&rdquo;</span>
            <button type="button" disabled={busy} onClick={() => run(() => keepSkitRevisionAction(projectId))} className="h-8 rounded-lg bg-hover px-3 text-[13px] font-medium disabled:opacity-60">
              Keep
            </button>
            <button type="button" disabled={busy} onClick={() => run(() => undoSkitRevisionAction(projectId))} className="h-8 rounded-lg border border-line-strong px-3 text-[13px] font-medium disabled:opacity-60">
              Undo rewrite
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
          <ol aria-label="Beats" className="mx-auto flex w-full max-w-[760px] flex-col gap-2">
            {beats.map((beat, i) => {
              const sceneIndex = beat.scene !== beats[i - 1]?.scene ? scenes.findIndex((sc) => sc.id === beat.scene) : -1;
              const scene = sceneIndex >= 0 ? scenes[sceneIndex] : undefined;
              return (
                <Fragment key={beat.id}>
                  {scene && (
                    <SceneHeading
                      n={sceneIndex + 1}
                      of={scenes.length}
                      scene={scene}
                      options={setOptions}
                      onSet={(setId) => reshape(() => ({ skit: setSceneSet(skit, scene.id, setId) }))}
                      onMove={(dir) => reshape(() => ({ skit: moveScene(skit, scene.id, dir) }))}
                      onDrop={() => reshape(() => ({ skit: dropScene(skit, scene.id) }))}
                      onAdd={() => reshape(() => addScene(skit, scene.id, scene.set && setOptions.some((s) => s.id === scene.set) ? scene.set : (setOptions[0]?.id ?? scene.set ?? "plain-1")), true)}
                    />
                  )}
                  <BeatCard
                    index={i + 1}
                    beat={beat}
                    cast={cast}
                    hook={beat.id === beats.find((b) => !b.silent)?.id}
                    hooks={hooks}
                    onHooks={() => {
                      if (!beat.line) return;
                      if (!window.confirm("Try other hooks · up to $0.01?")) return;
                      startBusy(async () => {
                        const result = await hooksAction(projectId, beat.line!, topic);
                        if (!result.ok) setError(result.error);
                        else setHooks(result.hooks);
                      });
                    }}
                    onPickHook={(line) => {
                      edit(beat.id, { line });
                      setHooks(null);
                    }}
                    open={openId === beat.id}
                    playing={playing === beat.id}
                    onOpen={() => jump(beat.id)}
                    onEdit={(patch) => edit(beat.id, patch)}
                    onSplit={(before, after) =>
                      reshape(() => {
                        const base = before.trim() ? editBeat(skit, beat.id, { line: before }) : skit;
                        const added = addBeat(base, beat.id);
                        const next = after.trim() ? editBeat(added.skit, added.id, { line: after }) : added.skit;
                        return { skit: next, id: added.id };
                      }, true)
                    }
                    onDuplicate={() => reshape(() => duplicateBeat(skit, beat.id), true)}
                    onDelete={() => reshape(() => ({ skit: deleteBeat(skit, beat.id) }))}
                    onMove={(dir) => reshape(() => ({ skit: moveBeat(skit, beat.id, dir) }))}
                  />
                </Fragment>
              );
            })}
          </ol>
          <div className="mx-auto mt-3 flex w-full max-w-[760px] justify-center">
            <button
              type="button"
              onClick={() => reshape(() => addBeat(skit, beats.at(-1)?.id ?? null), true)}
              className="h-9 rounded-full border border-line px-4 text-[13px] font-medium text-fg-2 hover:bg-hover"
            >
              Add a line
            </button>
          </div>

          <div className="mx-auto mt-8 flex w-full max-w-[760px] flex-col gap-2.5 border-t border-rule pt-6 pb-8">
            <label htmlFor="skit-note" className="text-[13px] font-medium text-fg-2">
              Ask for a change
            </label>
            <textarea
              id="skit-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="For example: make June meaner, or land the punchline sooner"
              className="box-border w-full resize-none rounded-lg border border-line bg-panel px-3 py-2.5 text-[13px] leading-normal text-fg placeholder:text-fg-muted"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-fg-muted">
                Rewrites the joke · up to <span className="font-mono">${STICK_SCRIPT_PRICE_USD.toFixed(2)}</span> · you can undo it
              </span>
              <button
                type="button"
                disabled={busy || !note.trim()}
                onClick={() =>
                  run(
                    () => reviseSkitAction(projectId, note, sourceComment),
                    () => {
                      setNote("");
                      setSourceComment(undefined);
                    },
                  )
                }
                className="h-[34px] shrink-0 rounded-lg border border-line-strong bg-hover px-3.5 text-[13px] font-medium text-fg disabled:opacity-60"
              >
                {busy ? "Working…" : "Rewrite"}
              </button>
            </div>
          </div>
        </div>
      </main>

      <aside aria-label="Preview and approve" className="flex w-[min(400px,38vw)] min-w-[280px] shrink-0 flex-col border-l border-rule-2 bg-panel-2">
        <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pt-3">
          <div ref={stageRef} data-w={Math.round(stageSize.width)} data-h={Math.round(stageSize.height)} className="relative min-h-0 flex-1">
            <div className="absolute inset-0 flex items-center justify-center">
              {fitted.width > 0 ? (
                <BrandFrame brand={brand}>
                  <SkitPreview skit={skit} width={fitted.width} height={fitted.height} seekTo={seek} onFrame={onFrame} onSpans={onSpans} audio={sound} fontFamily={previewFont} />
                </BrandFrame>
              ) : (
                <div className={`${frameClass(shape)} h-full max-w-full rounded-xl bg-panel`} />
              )}
            </div>
          </div>
          <CameraStrip
            cuts={verdict.cuts}
            frame={frame}
            beat={beats.find((b) => b.id === playing) ?? null}
            nameOf={(id) => {
              const member = cast.find((c) => c.id === id);
              return member?.label ?? characterName(member?.character ?? id);
            }}
            onSeek={(at) => {
              setFrame(at);
              setSeek((prev) => ({ frame: at, nonce: (prev?.nonce ?? 0) + 1 }));
            }}
            onPin={(framing) => {
              const beat = beats.find((b) => b.id === playing);
              if (!beat) return;
              const same = beat.shot?.framing === framing;
              edit(beat.id, { shot: same ? null : framing === "close" && beat.speaker ? { framing, on: beat.speaker } : { framing } });
            }}
            onReaction={() => {
              const beat = beats.find((b) => b.id === playing);
              if (!beat) return;
              edit(beat.id, { reaction: beat.reaction === false ? null : false });
            }}
            onPause={(delta) => {
              const beat = beats.find((b) => b.id === playing);
              if (!beat) return;
              const next = Math.min(2000, Math.max(0, (beat.pauseBeforeMs ?? 0) + delta));
              edit(beat.id, { pauseBeforeMs: next === 0 ? null : next });
            }}
          />
          <div className="flex items-center justify-between gap-2 px-1">
            <p className="text-[11px] text-fg-muted">{sound ? "Sound on · timing follows the prepared voice when one is loaded" : "Silent preview · timing is estimated"}</p>
            <button type="button" onClick={() => setSound((v) => !v)} className="text-[12px] text-fg-2">{sound ? "Mute" : "Unmute"}</button>
            <SpeakButton text={spoken} voiceId={previewVoice} label="Hear it" />
          </div>
          <div className="flex flex-wrap items-center gap-2 px-1 text-[12px] text-fg-2">
            <label className="flex items-center gap-1">
              Music
              <select aria-label="Music bed" value={bed} onChange={(e) => setBed(e.target.value)} className="h-7 rounded border border-line bg-panel px-1">
                <option value="">None</option>
                {MUSIC_BEDS.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              Duck
              <input aria-label="Music volume" type="range" min={0} max={1} step={0.05} value={bedVolume} onChange={(e) => setBedVolume(Number(e.target.value))} />
            </label>
            <button
              type="button"
              onClick={() => {
                startBusy(async () => {
                  const result = await musicAction(projectId, bed || null, bedVolume);
                  if (!result.ok) setError(result.error);
                });
              }}
              className="text-accent-link"
            >
              Save bed
            </button>
            {origin === "paste" && (
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm("Tidy for timing · up to $0.01? Lines stay as they are.")) return;
                  startBusy(async () => {
                    const result = await tidyAction(projectId);
                    if (!result.ok) setError(result.error);
                    else router.refresh();
                  });
                }}
                className="text-accent-link"
              >
                Tidy for timing · $0.01
              </button>
            )}
          </div>
          <ol aria-label="Story" className="flex gap-1 overflow-x-auto pb-1">
            {beats.map((beat, i) => (
              <li key={beat.id} className="shrink-0">
                <button
                  type="button"
                  draggable
                  aria-label={`Beat ${i + 1}${playing === beat.id ? ", playing" : ""}`}
                  aria-current={openId === beat.id ? "true" : undefined}
                  onClick={() => jump(beat.id)}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", beat.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData("text/plain");
                    if (!id || id === beat.id) return;
                    const to = beats.findIndex((b) => b.id === beat.id);
                    reshape(() => ({ skit: placeBeat(skit, id, to) }));
                  }}
                  className={`flex h-10 w-9 items-center justify-center rounded-lg border ${
                    playing === beat.id ? "border-accent bg-accent-soft" : openId === beat.id ? "border-line-strong bg-hover" : "border-transparent bg-panel hover:bg-hover"
                  }`}
                >
                  <Face expression={beat.expression} character={cast.find((c) => c.id === beat.speaker)?.character} size={22} />
                </button>
              </li>
            ))}
          </ol>
        </div>

        <div className="border-t border-rule px-4 py-2">
          <details className="group" role="region" aria-label="Self-check">
            <summary className={`cursor-pointer text-[13px] ${errors.length ? "text-accent-link" : findings.length ? "text-attention" : "text-ready"}`}>
              {statusWord}
              {warnings.length > 0 && <span className="text-fg-muted"> · writer adjusted {warnings.length}</span>}
            </summary>
            <div className="mt-2 flex max-h-28 flex-col gap-1.5 overflow-y-auto">
              {findings.map((f, i) => {
                const place = where(skit, f.path);
                const target = findingTarget(skit, f.path);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      if (!target) return;
                      const beat = beats[target.beat - 1];
                      if (!beat) return;
                      jump(beat.id);
                      document.getElementById(`beat-${beat.id}`)?.scrollIntoView({ block: "center" });
                    }}
                    className="text-left text-[13px] leading-snug text-fg-2"
                  >
                    <span className={f.level === "error" ? "text-accent-link" : "text-attention"}>{f.level === "error" ? "Problem" : "Look"} · </span>
                    {place && <span className="text-fg">{place}: </span>}
                    {f.message}
                  </button>
                );
              })}
              {warnings.map((w, i) => (
                <p key={`w${i}`} className="text-[13px] leading-snug text-fg-3">
                  {w}
                </p>
              ))}
            </div>
          </details>
          {slamFixed && <p className="mt-1 text-[12px] text-attention">Slam timing was corrected. Save to keep it.</p>}
        </div>

        {produce && <div className="px-3 pb-1"><ProducePanel projectId={projectId} produce={produce} limitUsd={limitUsd} /></div>}
        {error && (
          <p role="alert" className="px-4 pb-1 text-[13px] text-attention">
            {error}
          </p>
        )}

        <div className="mt-auto flex items-center gap-2 border-t border-rule bg-panel-2 px-3 py-3">
          <button
            type="button"
            onClick={() => void flush()}
            disabled={save === "saved" || save === "saving"}
            className="h-11 rounded-[10px] border border-line-strong bg-hover px-4 text-[14px] font-semibold disabled:opacity-50"
          >
            {save === "saving" ? "Saving…" : "Save"}
          </button>
          <span role="status" suppressHydrationWarning className="min-w-0 flex-1 truncate text-[12px] text-fg-muted">
            {saveWord}
          </span>
          <button
            type="button"
            disabled={!approvable || approving || busy}
            aria-describedby={approvable ? undefined : "approve-blocked"}
            onClick={approve}
            className="flex h-11 items-center gap-2 rounded-[10px] bg-accent px-3.5 text-[14px] font-semibold text-accent-ink disabled:opacity-50"
          >
            {approving ? "Starting…" : "Approve"}
            <span className="font-mono text-[12px] font-medium">~${estimate.totalUsd.toFixed(2)}</span>
          </button>
        </div>
        <p id="approve-blocked" className="px-4 pb-3 text-[11px] leading-snug text-fg-muted">
          {making
            ? "The video is being made from the skit you approved."
            : approvable
              ? "Nothing is spent until you approve. ⌘S saves."
              : `Fix ${verdict.check.errors === 1 ? "the problem" : `the ${verdict.check.errors} problems`} the check found first.`}
        </p>
      </aside>
    </div>
  );
}

const POLL_MS = 1500;

function ProducePanel({ projectId, produce, limitUsd }: { projectId: string; produce: ProduceState; limitUsd: string }) {
  const router = useRouter();
  const live = !isTerminal(produce.status);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [live, router]);

  const facts = { stage: "stick-produce" as const, status: produce.status, error: produce.error, costUsd: produce.costUsd, meteredSteps: produce.meteredSteps, hasOutput: produce.versionNumber !== null };
  const state = studioState(facts);

  if (produce.status === "failed") {
    return (
      <p role="alert" className="rounded-lg border border-attention-line bg-attention-soft px-3 py-2 text-[12px] text-fg-2">
        <span className="font-medium text-attention">The video wasn’t made. </span>
        {failureNotice(facts, limitUsd).message}
      </p>
    );
  }
  if (produce.status === "completed" && produce.versionNumber !== null) {
    return (
      <p className="flex flex-wrap items-center gap-2 px-1 text-[12px] text-fg-2">
        <span className="size-1.5 rounded-full bg-ready" />
        Version {produce.versionNumber} is ready
        {!produce.current && <span className="text-fg-3">· changed the skit since this video</span>}
        <Link href={`/p/${projectId}/review`} className="text-accent-link">Review</Link>
        <Link href={`/p/${projectId}/export`} className="text-accent-link">Download</Link>
      </p>
    );
  }
  return (
    <p role="status" aria-live="polite" className="flex items-center gap-2 px-1 text-[12px]">
      <span className={`size-1.5 rounded-full ${state.dot === "accent" ? "animate-pulse bg-accent" : "bg-fg-muted"}`} />
      {state.word === "Queued" ? "Waiting to start…" : "Voicing the lines and drawing the video…"}
    </p>
  );
}

function SceneHeading({
  n,
  of,
  scene,
  options,
  onSet,
  onMove,
  onDrop,
  onAdd,
}: {
  n: number;
  of: number;
  scene: SkitScene;
  options: { id: string; label: string }[];
  onSet: (setId: string) => void;
  onMove: (dir: "up" | "down") => void;
  onDrop: () => void;
  onAdd: () => void;
}) {
  return (
    <li className={`flex flex-wrap items-center gap-2 px-1 ${n > 1 ? "pt-4" : ""}`}>
      <h2 className={label}>Scene {n} of {of}</h2>
      {options.length > 0 && <SetPicker value={scene.set ?? ""} options={options} label={`Scene ${n} set`} onChange={onSet} />}
      {(scene.card ?? scene.pov) && <span className="truncate text-xs text-fg-3">{scene.card ? `Card: ${scene.card}` : scene.pov}</span>}
      <span className="ml-auto flex items-center gap-1">
        <IconButton label={`Move scene ${n} up`} disabled={n === 1} onClick={() => onMove("up")}>↑</IconButton>
        <IconButton label={`Move scene ${n} down`} disabled={n === of} onClick={() => onMove("down")}>↓</IconButton>
        <IconButton label={`Add a scene after scene ${n}`} onClick={onAdd}>+ scene</IconButton>
        <IconButton label={`Drop scene ${n}`} onClick={onDrop}>Drop</IconButton>
      </span>
    </li>
  );
}

function IconButton({ children, label: aria, disabled, onClick }: { children: ReactNode; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-label={aria} disabled={disabled} onClick={onClick} className="h-7 rounded-md px-2 text-[12px] text-fg-3 hover:bg-hover disabled:opacity-30">
      {children}
    </button>
  );
}

function BeatCard({
  index,
  beat,
  cast,
  open,
  playing,
  onOpen,
  onEdit,
  onSplit,
  onDuplicate,
  onDelete,
  onMove,
  hook,
  hooks,
  onHooks,
  onPickHook,
}: {
  index: number;
  beat: EditableBeat;
  cast: { id: string; character: string; label?: string }[];
  open: boolean;
  playing: boolean;
  onOpen: () => void;
  onEdit: (patch: BeatPatch) => void;
  onSplit: (before: string, after: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (dir: "up" | "down") => void;
  hook?: boolean;
  hooks?: string[] | null;
  onHooks?: () => void;
  onPickHook?: (line: string) => void;
}) {
  const member = cast.find((c) => c.id === beat.speaker);
  const name = member ? `${characterName(member.character)}${member.label ? ` · ${member.label}` : ""}` : (beat.speaker ?? "Silent");
  const what = beat.silent ? `Beat ${index}, silent` : `Beat ${index}`;

  return (
    <li id={`beat-${beat.id}`} aria-label={what} onClick={onOpen} className={`flex flex-col gap-3 rounded-[14px] border bg-panel px-4 py-3.5 ${playing || open ? "border-accent/70" : "border-line"}`}>
      <div className="flex items-center gap-2">
        <span className="w-6 font-mono text-xs text-fg-muted">{String(index).padStart(2, "0")}</span>
        {beat.silent ? (
          <span className="text-[13px] text-fg-3">Silent{beat.speaker ? ` · ${name}` : ""}</span>
        ) : (
          <div className="flex flex-wrap gap-1" role="group" aria-label={`${what}: speaker`}>
            {cast.map((c) => {
              const selected = beat.speaker === c.id;
              return (
                <div key={c.id} className={`flex items-center rounded-full border ${selected ? "border-accent bg-accent-soft" : "border-line"}`}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    aria-label={characterName(c.character)}
                    onClick={() => onEdit({ speaker: c.id })}
                    className="flex items-center gap-1.5 rounded-full py-0.5 pr-2 pl-0.5 text-[12px] hover:bg-hover"
                  >
                    <Face character={c.character} expression={selected ? beat.expression : "neutral"} size={22} />
                    {characterName(c.character)}
                    {c.label ? <span className="text-fg-muted">{c.label}</span> : null}
                  </button>
                  {selected ? <MoodMenu beat={beat} character={c.character} what={what} onEdit={onEdit} /> : null}
                </div>
              );
            })}
          </div>
        )}
        <span className="ml-auto flex items-center">
          <IconButton label={`Move beat ${index} up`} onClick={() => onMove("up")}>↑</IconButton>
          <IconButton label={`Move beat ${index} down`} onClick={() => onMove("down")}>↓</IconButton>
          <IconButton label={`Duplicate beat ${index}`} onClick={onDuplicate}>Copy</IconButton>
          <IconButton label={`Delete beat ${index}`} onClick={onDelete}>Delete</IconButton>
        </span>
      </div>

      {!beat.silent && (
        <>
          <LineField beat={beat} what={what} onEdit={onEdit} onSplit={onSplit} />
          {hook && hooks && hooks.length > 0 && (
            <ul className="flex flex-col gap-1">
              {hooks.map((line) => (
                <li key={line}>
                  <button type="button" onClick={() => onPickHook?.(line)} className="w-full rounded-lg border border-line px-3 py-2 text-left text-[13px] hover:border-accent">
                    {line}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {beat.slams.map((value, i) => (
              <span key={i} className="flex items-center gap-1 rounded-lg border border-line bg-canvas-script pr-1">
                <input
                  aria-label={`${what}: text slam ${i + 1}`}
                  value={value}
                  onChange={(e) => onEdit({ slams: beat.slams.map((s, j) => (j === i ? e.target.value : s)) })}
                  className="h-7 w-28 bg-transparent px-2 font-mono text-xs font-semibold text-accent uppercase outline-none"
                />
                <button type="button" aria-label={`Remove text slam ${i + 1}`} onClick={() => onEdit({ slams: beat.slams.filter((_, j) => j !== i) })} className="size-5 rounded text-fg-muted hover:bg-hover">
                  ×
                </button>
              </span>
            ))}
            <button type="button" onClick={() => onEdit({ slams: [...beat.slams, "WAIT"] })} className="h-7 rounded-lg px-2 text-xs text-fg-3 hover:bg-hover">
              + Text slam
            </button>
            <SfxChip value={beat.sfx} slam={beat.slams[0]} label={`${what}: sound`} onChange={(id) => onEdit({ sfx: id })} />
            {hook && (
              <button type="button" onClick={onHooks} className="h-7 rounded-lg px-2 text-xs text-accent-link hover:bg-hover">
                Try other hooks · $0.01
              </button>
            )}
            <label className="ml-auto flex items-center gap-2 text-xs text-fg-muted">
              Pause
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                aria-label={`${what}: pause before, in seconds`}
                value={(beat.pauseBeforeMs ?? 0) / 1000}
                onChange={(e) => onEdit({ pauseBeforeMs: Number(e.target.value) === 0 ? null : Number(e.target.value) * 1000 })}
                className="w-24 accent-accent"
              />
              <span className="w-8 font-mono text-fg-2">{((beat.pauseBeforeMs ?? 0) / 1000).toFixed(1)}s</span>
            </label>
          </div>
        </>
      )}
    </li>
  );
}

function moodLabel(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/** Word spans in the raw line, using the same token rules as the slam anchors. */
function wordSpans(line: string): { start: number; end: number; norm: string; occurrence: number }[] {
  const spans: { start: number; end: number; norm: string; occurrence: number }[] = [];
  const seen = new Map<string, number>();
  for (const m of line.matchAll(/\S+/g)) {
    const raw = m[0];
    const norm = normWord(raw);
    const prev = spans[spans.length - 1];
    if (!norm && prev) {
      prev.end = m.index + raw.length;
      continue;
    }
    const key = norm || normWord(raw);
    const occurrence = key ? (seen.get(key) ?? 0) + 1 : 1;
    if (key) seen.set(key, occurrence);
    spans.push({ start: m.index, end: m.index + raw.length, norm: key, occurrence });
  }
  return spans;
}

const lineType = "w-full font-display text-[22px] leading-snug break-words whitespace-pre-wrap";

function LineField({
  beat,
  what,
  onEdit,
  onSplit,
}: {
  beat: EditableBeat;
  what: string;
  onEdit: (patch: BeatPatch) => void;
  onSplit: (before: string, after: string) => void;
}) {
  const line = beat.line ?? "";
  const spans = wordSpans(line);
  const nodes: ReactNode[] = [];
  let cursor = 0;
  spans.forEach((span, i) => {
    if (span.start > cursor) nodes.push(line.slice(cursor, span.start));
    const text = line.slice(span.start, span.end);
    const hit = span.norm !== "" && beat.slamAt.some((at) => at && at.word === span.norm && at.occurrence === span.occurrence);
    nodes.push(
      hit ? (
        <mark key={i} className="rounded-[3px] bg-accent/30 text-inherit">
          {text}
        </mark>
      ) : (
        <span key={i}>{text}</span>
      ),
    );
    cursor = span.end;
  });
  if (cursor < line.length) nodes.push(line.slice(cursor));

  return (
    <div className="grid min-h-[2.75rem] min-w-0">
      <div aria-hidden className={`col-start-1 row-start-1 ${lineType} text-fg`}>
        {nodes}
        {line.endsWith("\n") ? " " : ""}
      </div>
      <textarea
        aria-label={`${what}: line`}
        title="Double-click a word to slam it"
        rows={1}
        value={line}
        onChange={(e) => onEdit({ line: e.target.value })}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.shiftKey) return;
          e.preventDefault();
          const el = e.currentTarget;
          onSplit(el.value.slice(0, el.selectionStart), el.value.slice(el.selectionStart));
        }}
        onDoubleClick={(e) => {
          const el = e.currentTarget;
          const from = Math.min(el.selectionStart, el.selectionEnd);
          const to = Math.max(el.selectionStart, el.selectionEnd);
          const span = wordSpans(el.value).find((s) => s.norm && s.start < to && s.end > from);
          if (!span) return;
          const anchor = { word: span.norm, occurrence: span.occurrence };
          const value = span.norm.toUpperCase();
          if (beat.slams.length === 0) onEdit({ slams: [value], slamAnchors: [anchor] });
          else onEdit({ slams: [value, ...beat.slams.slice(1)], slamAnchors: [anchor, ...beat.slamAt.slice(1)] });
        }}
        placeholder="Write the line"
        className={`col-start-1 row-start-1 resize-none overflow-hidden border-none bg-transparent ${lineType} text-transparent caret-fg outline-none selection:bg-accent/40 placeholder:text-fg-muted`}
      />
    </div>
  );
}

function MoodMenu({
  beat,
  character,
  what,
  onEdit,
}: {
  beat: EditableBeat;
  character?: string;
  what: string;
  onEdit: (patch: BeatPatch) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const mood = beat.expression || "neutral";

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={moodLabel(mood)}
        aria-label={`${what}: expression is ${moodLabel(mood)}. Change it`}
        onClick={() => setOpen((v) => !v)}
        className="mr-1 grid size-5 place-items-center rounded-full text-[11px] text-fg-3 hover:bg-hover"
      >
        ▾
      </button>
      {open && (
        <ul role="listbox" aria-label={`${what}: expression`} className="absolute top-full left-0 z-30 mt-1 grid w-[248px] grid-cols-4 gap-0.5 rounded-xl border border-line bg-raised p-1.5 shadow-[0_12px_40px_rgb(0_0_0/0.45)]">
          {stickCatalog.expressions.map((x) => {
            const on = mood === x;
            return (
              <li key={x}>
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  aria-label={x}
                  onClick={() => {
                    onEdit({ expression: x });
                    setOpen(false);
                  }}
                  className={`flex w-full flex-col items-center gap-1 rounded-lg px-1 py-1.5 ${on ? "bg-accent-soft" : "hover:bg-hover"}`}
                >
                  <Face expression={x} character={character} size={28} />
                  <span className="text-[10px] leading-none text-fg-3">{moodLabel(x)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

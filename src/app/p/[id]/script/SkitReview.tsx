"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { normWord, tokenize } from "stickstage";

import { Face } from "@/components/stick-skit/Face";
import { fit916 } from "@/components/stick-skit/fit";
import { SkitPreview, type BeatSpan } from "@/components/stick-skit/SkitPreview";
import { useElementSize } from "@/components/stick-skit/useElementSize";
import { STICK_SCRIPT_PRICE_USD } from "@/lib/estimate";
import { failureNotice, studioState } from "@/lib/run-state";
import { stickCatalog } from "@/lib/stick/registry";
import { isTerminal } from "@/lib/tamtree/types";
import type { Skit } from "@/lib/tamtree/stage-flows";
import type { ProduceState } from "@/services/skit";
import { estimateProduce } from "@/types/stick-skit";
import { characterName, setLabel } from "@/types/stick-skit/catalog";
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
  catalogVersion,
  warnings,
  revisionNote,
  produce,
  fromComment,
  setOptions,
  focusFraction,
}: {
  projectId: string;
  topic: string;
  skit: Skit;
  limitUsd: string;
  catalogVersion: string;
  warnings: string[];
  revisionNote: string | null;
  produce: ProduceState | null;
  fromComment: { id: string; note: string } | null;
  setOptions: { id: string; label: string }[];
  /** 0–1, from a review comment. Seeks the preview and opens that beat. */
  focusFraction: number | null;
}) {
  const router = useRouter();
  const opened = useMemo(() => alignSlams(initial), [initial]);
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
  const playing = spans.find((s) => frame >= s.from && frame < s.to)?.id ?? null;

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
  const fitted = fit916(stageSize.width, Math.max(0, stageSize.height));

  async function flush(): Promise<boolean> {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const pending = latest.current;
    if (!pending) return true;
    latest.current = null;
    setSave("saving");
    const result = await saveSkitBeatsAction(projectId, allBeats(pending), scenePlanOf(pending));
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

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

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

  return (
    <div className="flex min-h-0 flex-1 bg-canvas-script">
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex items-end justify-between gap-4 px-6 pt-6 pb-3">
          <div className="min-w-0">
            <h1 className="truncate font-display text-[32px] leading-none tracking-[-0.01em]">{topic}</h1>
            <p className="mt-1.5 text-[13px] text-fg-muted">
              {beats.length} {beats.length === 1 ? "line" : "lines"}
              {scenes.length > 1 ? ` · ${scenes.length} scenes` : ""}
              {scenes.length <= 1 && scenes[0]?.set ? ` · ${setLabel(scenes[0].set)}` : ""}
              {scenes.length === 0 && typeof (skit as { set?: unknown }).set === "string" ? ` · ${setLabel((skit as { set: string }).set)}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" disabled={undoCount === 0} onClick={undoLocal} className="h-8 rounded-lg px-2.5 text-[13px] text-fg-2 hover:bg-hover disabled:opacity-30">
              Undo
            </button>
            {scenes.length <= 1 && setOptions.length > 1 && (
              <SetSelect
                value={typeof (skit as { set?: unknown }).set === "string" ? (skit as { set: string }).set : ""}
                options={setOptions}
                label="Set"
                onChange={(setId) => reshape(() => ({ skit: setSceneSet(skit, null, setId) }))}
              />
            )}
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
                <SkitPreview skit={skit} width={fitted.width} height={fitted.height} seekTo={seek} onFrame={onFrame} onSpans={onSpans} />
              ) : (
                <div className="aspect-[9/16] h-full max-w-full rounded-xl bg-panel" />
              )}
            </div>
          </div>
          <div className="flex items-center justify-between px-1">
            <p className="text-[11px] text-fg-muted">Silent preview · timing is estimated</p>
            <p className="font-mono text-[10px] text-fg-muted">{catalogVersion}</p>
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
          <details className="group">
            <summary className={`cursor-pointer text-[13px] ${errors.length ? "text-accent-link" : findings.length ? "text-attention" : "text-ready"}`}>
              {statusWord}
              {warnings.length > 0 && <span className="text-fg-muted"> · writer adjusted {warnings.length}</span>}
            </summary>
            <div className="mt-2 flex max-h-28 flex-col gap-1.5 overflow-y-auto">
              {findings.map((f, i) => (
                <p key={i} className="text-[13px] leading-snug text-fg-2">
                  <span className={f.level === "error" ? "text-accent-link" : "text-attention"}>{f.level === "error" ? "Problem" : "Look"} · </span>
                  {where(skit, f.path) && <span className="text-fg">{where(skit, f.path)}: </span>}
                  {f.message}
                </p>
              ))}
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
        {!produce.current && <span className="text-fg-3">· skit changed since</span>}
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

function SetSelect({ value, options, label: aria, onChange }: { value: string; options: { id: string; label: string }[]; label: string; onChange: (id: string) => void }) {
  return (
    <select aria-label={aria} value={value} onChange={(e) => onChange(e.target.value)} className="h-8 rounded-lg border border-line bg-canvas-script px-2 text-[13px] text-fg">
      {value && !options.some((o) => o.id === value) && <option value={value}>{setLabel(value)}</option>}
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.label}</option>
      ))}
    </select>
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
      {options.length > 0 && <SetSelect value={scene.set ?? ""} options={options} label={`Scene ${n} set`} onChange={onSet} />}
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
}) {
  const member = cast.find((c) => c.id === beat.speaker);
  const name = member ? `${characterName(member.character)}${member.label ? ` · ${member.label}` : ""}` : (beat.speaker ?? "Silent");
  const what = beat.silent ? `Beat ${index}, silent` : `Beat ${index}`;

  return (
    <li aria-label={what} onClick={onOpen} className={`flex flex-col gap-3 rounded-[14px] border bg-panel px-4 py-3.5 ${playing || open ? "border-accent/70" : "border-line"}`}>
      <div className="flex items-center gap-2">
        <span className="w-6 font-mono text-xs text-fg-muted">{String(index).padStart(2, "0")}</span>
        {beat.silent ? (
          <span className="text-[13px] text-fg-3">Silent{beat.speaker ? ` · ${name}` : ""}</span>
        ) : (
          <div className="flex flex-wrap gap-1" role="group" aria-label={`${what}: speaker`}>
            {cast.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={beat.speaker === c.id}
                aria-label={characterName(c.character)}
                onClick={() => onEdit({ speaker: c.id })}
                className={`flex items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-0.5 text-[12px] ${beat.speaker === c.id ? "border-accent bg-accent-soft" : "border-line hover:bg-hover"}`}
              >
                <Face character={c.character} expression={beat.speaker === c.id ? beat.expression : "neutral"} size={22} />
                {characterName(c.character)}
                {c.label ? <span className="text-fg-muted">{c.label}</span> : null}
              </button>
            ))}
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
          <div className="flex flex-wrap gap-1" role="group" aria-label={`${what}: expression`}>
            {stickCatalog.expressions.map((x) => (
              <button
                key={x}
                type="button"
                aria-pressed={beat.expression === x}
                aria-label={x}
                title={x}
                onClick={() => onEdit({ expression: x })}
                className={`rounded-lg border p-0.5 ${beat.expression === x ? "border-accent" : "border-transparent hover:bg-hover"}`}
              >
                <Face expression={x} character={member?.character} size={26} />
              </button>
            ))}
          </div>

          <textarea
            aria-label={`${what}: line`}
            rows={2}
            value={beat.line ?? ""}
            onChange={(e) => onEdit({ line: e.target.value })}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.shiftKey) return;
              e.preventDefault();
              const el = e.currentTarget;
              onSplit(el.value.slice(0, el.selectionStart), el.value.slice(el.selectionStart));
            }}
            placeholder="Write the line"
            className="w-full resize-none border-none bg-transparent font-display text-[22px] leading-snug text-fg outline-none placeholder:text-fg-muted"
          />

          <WordRow beat={beat} what={what} onEdit={onEdit} />

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

function WordRow({ beat, what, onEdit }: { beat: EditableBeat; what: string; onEdit: (patch: BeatPatch) => void }) {
  const tokens = tokenize(beat.line ?? "");
  if (tokens.length === 0) return <p className="text-[12px] text-fg-muted">Double-click a word to slam it.</p>;
  const seen = new Map<string, number>();
  return (
    <div className="flex flex-wrap gap-1" aria-label={`${what}: words`}>
      {tokens.map((token, i) => {
        const word = token.norm || normWord(token.text);
        const occurrence = (seen.get(word) ?? 0) + 1;
        seen.set(word, occurrence);
        const hit = beat.slamAt.some((at) => at && at.word === word && at.occurrence === occurrence);
        return (
          <button
            key={`${i}-${word}`}
            type="button"
            title="Double-click to slam this word"
            onDoubleClick={() => {
              const value = (word || token.text).toUpperCase();
              const anchor = word ? { word, occurrence } : null;
              if (beat.slams.length === 0) onEdit({ slams: [value], slamAnchors: anchor ? [anchor] : [null] });
              else onEdit({ slams: [value, ...beat.slams.slice(1)], slamAnchors: [anchor, ...beat.slamAt.slice(1)] });
            }}
            className={`rounded-md px-1.5 py-0.5 text-[13px] ${hit ? "bg-accent font-semibold text-accent-ink" : "text-fg-2 hover:bg-hover"}`}
          >
            {token.text}
          </button>
        );
      })}
    </div>
  );
}

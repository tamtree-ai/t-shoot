"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import Link from "next/link";

import { SkitPreview } from "@/components/stick-skit/SkitPreview";
import { stickCatalog } from "@/lib/stick/registry";
import { STICK_SCRIPT_PRICE_USD } from "@/lib/estimate";
import { failureNotice, studioState } from "@/lib/run-state";
import { isTerminal } from "@/lib/tamtree/types";
import type { Skit } from "@/lib/tamtree/stage-flows";
import type { ProduceState } from "@/services/skit";
import { estimateProduce } from "@/types/stick-skit";
import { characterName } from "@/types/stick-skit/catalog";
import { beatsOf, canApprove, castOf, editBeat, judgeSkit, type BeatPatch, type EditableBeat } from "@/types/stick-skit/draft";
import {
  approveSkitAction,
  keepSkitRevisionAction,
  reviseSkitAction,
  saveSkitBeatsAction,
  undoSkitRevisionAction,
} from "./actions";

const SAVE_AFTER_MS = 600;
const label = "text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase";
const field = "box-border rounded-lg border border-line bg-canvas-script px-2.5 text-[13px] text-fg";

type SaveState = "saved" | "saving" | "unsaved" | "failed";
type Finding = { check?: string; level?: string; message?: string; path?: string };

/** `beats[1].line` → "Beat 2, line": where a finding points, in the editor's own numbering. */
function where(path?: string): string | null {
  const m = path?.match(/^beats\[(\d+)\](?:\.(\w+))?/);
  if (!m) return null;
  return `Beat ${Number(m[1]) + 1}${m[2] ? `, ${m[2] === "pauseBeforeMs" ? "pause" : m[2] === "text" ? "text slam" : m[2]}` : ""}`;
}

/**
 * The skit review (09 §6 step 4, K3): every edit is re-checked here, in the browser, with the
 * same `checkDraft` the render service runs; nothing is run and nothing is spent until Approve,
 * which stays shut while the check has errors.
 */
export function SkitReview({
  projectId,
  topic,
  skit: initial,
  limitUsd,
  catalogVersion,
  revisionNote,
  produce,
  initialNote,
}: {
  projectId: string;
  topic: string;
  skit: Skit;
  limitUsd: string;
  catalogVersion: string;
  revisionNote: string | null;
  produce: ProduceState | null;
  /** A review comment being turned into a change (09 §6.6): it starts the Ask-for-a-change note. */
  initialNote: string;
}) {
  const router = useRouter();
  const [skit, setSkit] = useState(initial);
  const [save, setSave] = useState<SaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState(initialNote);
  const [busy, startBusy] = useTransition();
  const [approving, startApprove] = useTransition();

  const verdict = useMemo(() => judgeSkit(skit), [skit]);
  const beats = useMemo(() => beatsOf(skit), [skit]);
  const cast = castOf(skit);
  const estimate = estimateProduce(verdict.lines.length);
  const making = !!produce && !isTerminal(produce.status);
  const approvable = canApprove(verdict) && !making;
  const findings = (verdict.check.findings as Finding[]).filter((f) => f.level === "error" || f.level === "warning");

  // Debounced save of the owner's edits. `latest` is what the next save sends.
  const latest = useRef<Skit | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function flush(): Promise<boolean> {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const pending = latest.current;
    if (!pending) return true;
    latest.current = null;
    setSave("saving");
    const result = await saveSkitBeatsAction(projectId, pending.beats);
    if (!result.ok) {
      setSave("failed");
      setError(result.error);
      return false;
    }
    setSave(latest.current ? "unsaved" : "saved");
    return true;
  }

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  function edit(beatId: string, patch: BeatPatch) {
    const next = editBeat(skit, beatId, patch);
    setSkit(next);
    latest.current = next;
    setSave("unsaved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_AFTER_MS);
  }

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

  return (
    <div className="flex flex-1 bg-canvas-script">
      <main className="flex flex-1 justify-center overflow-y-auto px-4">
        <div className="flex w-[680px] flex-col gap-6 py-10">
          <div className="flex items-end justify-between gap-4">
            <h1 className="font-display text-[36px] leading-[1.05] tracking-[-0.01em]">{topic}</h1>
            <span role="status" className="shrink-0 text-xs text-fg-muted">
              {save === "saving" ? "Saving…" : save === "unsaved" ? "Unsaved" : save === "failed" ? "Not saved" : "Saved"}
            </span>
          </div>

          {revisionNote && (
            <div className="flex items-center gap-3 rounded-[10px] border border-changed-pill-bg bg-changed-bg px-4 py-3">
              <span className="rounded-full bg-changed-pill-bg px-2 py-0.5 text-[11px] font-semibold text-changed-pill-fg">Changed by your note</span>
              <span className="flex-1 truncate text-[13px] text-fg-2">&ldquo;{revisionNote}&rdquo;</span>
              <button type="button" disabled={busy} onClick={() => run(() => keepSkitRevisionAction(projectId))} className="h-8 rounded-lg bg-hover px-3 text-[13px] font-medium disabled:opacity-60">
                Keep
              </button>
              <button type="button" disabled={busy} onClick={() => run(() => undoSkitRevisionAction(projectId))} className="h-8 rounded-lg border border-line-strong px-3 text-[13px] font-medium disabled:opacity-60">
                Undo
              </button>
            </div>
          )}

          <ol aria-label="Beats" className="flex flex-col gap-3">
            {beats.map((beat, i) => (
              <BeatRow key={beat.id} index={i + 1} beat={beat} cast={cast} onEdit={(patch) => edit(beat.id, patch)} />
            ))}
          </ol>
        </div>
      </main>

      <aside aria-label="Check and approve" className="box-border flex w-[420px] shrink-0 flex-col gap-5 overflow-y-auto border-l border-rule-2 bg-panel-2 px-6 py-7">
        <div className="mx-auto w-[220px]">
          <SkitPreview skit={skit} />
          <p className="mt-2 text-center text-[11px] text-fg-muted">Silent preview · timing is estimated until the voices exist</p>
          <p className="mt-1 text-center font-mono text-[10px] text-fg-muted">catalog {catalogVersion}</p>
        </div>

        <section aria-label="Self-check" className="flex flex-col gap-2">
          <span className={label}>Self-check</span>
          {findings.length === 0 ? (
            <p className="text-[13px] text-ready">No problems found.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {findings.map((f, i) => (
                <li key={i} className="flex gap-2 text-[13px] leading-snug">
                  <span className={f.level === "error" ? "text-accent-link" : "text-attention"}>{f.level === "error" ? "Problem" : "Worth a look"}</span>
                  <span className="text-fg-2">
                    {where(f.path) && <span className="text-fg">{where(f.path)}: </span>}
                    {f.message}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {produce && <ProducePanel projectId={projectId} produce={produce} limitUsd={limitUsd} />}

        <div className="flex flex-col gap-4 rounded-[14px] border border-raised-2 bg-raised-2 p-5">
          <span className="text-[13px] text-fg-3">Making this video</span>
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[34px] font-medium tracking-[-0.02em]">~${estimate.totalUsd.toFixed(2)}</span>
            <span className="text-[13px] text-fg-muted">render included</span>
          </div>
          <div className="flex flex-col gap-2 text-[13px]">
            <div className="flex justify-between gap-3">
              <span className="text-fg-2">
                Voice {estimate.lineCount} line{estimate.lineCount === 1 ? "" : "s"}
              </span>
              <span className="font-mono text-fg-2">${estimate.totalUsd.toFixed(3)}</span>
            </div>
            {verdict.estimatedDurationS !== null && (
              <div className="flex justify-between gap-3">
                <span className="text-fg-2">Length, about</span>
                <span className="font-mono text-fg-2">{Math.round(verdict.estimatedDurationS)}s</span>
              </div>
            )}
            <div className="h-px bg-panel" />
            <div className="flex justify-between gap-3">
              <span className="text-fg-3">Limit for this video</span>
              <span className="font-mono text-fg-2">${Number(limitUsd).toFixed(2)}</span>
            </div>
          </div>
          <button
            type="button"
            disabled={!approvable || approving || busy}
            aria-describedby={approvable ? undefined : "approve-blocked"}
            onClick={approve}
            className="flex h-12 items-center justify-center gap-2.5 rounded-[10px] bg-accent text-[15px] font-semibold text-accent-ink disabled:opacity-50"
          >
            {approving ? "Starting…" : "Approve and make the video"}
            <span className="font-mono text-[13px] font-medium">~${estimate.totalUsd.toFixed(2)}</span>
          </button>
          {making ? (
            <span className="text-xs leading-relaxed text-fg-muted">The video is being made from the skit you approved.</span>
          ) : approvable ? (
            <span className="text-xs leading-relaxed text-fg-muted">Nothing is spent until you approve.</span>
          ) : (
            <span id="approve-blocked" className="text-xs leading-relaxed text-attention">
              Fix {verdict.check.errors === 1 ? "the problem" : `the ${verdict.check.errors} problems`} the check found first.
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2.5">
          <label htmlFor="skit-note" className="text-[13px] font-medium text-fg-2">
            Ask for a change
          </label>
          <textarea
            id="skit-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="For example: make June meaner, or land the punchline sooner"
            className="box-border w-full resize-none rounded-lg border border-line bg-canvas-script px-3 py-2.5 text-[13px] leading-normal text-fg placeholder:text-fg-muted"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-fg-muted">
              Rewrites the skit · ~<span className="font-mono">${STICK_SCRIPT_PRICE_USD.toFixed(2)}</span> · you can undo it
            </span>
            <button
              type="button"
              disabled={busy || !note.trim()}
              onClick={() => run(() => reviseSkitAction(projectId, note), () => setNote(""))}
              className="h-[34px] rounded-lg border border-line-strong bg-hover px-3.5 text-[13px] font-medium text-fg disabled:opacity-60"
            >
              {busy ? "Working…" : "Rewrite"}
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-[13px] text-attention">
            {error}
          </p>
        )}
      </aside>
    </div>
  );
}

const POLL_MS = 1500;

/** The latest `stick-produce` run: live while it runs, then the version it made, or why it failed. */
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
      <div role="alert" className="flex flex-col gap-1.5 rounded-[12px] border border-attention-line bg-attention-soft px-4 py-3 text-[13px]">
        <span className="font-medium text-attention">The video wasn&rsquo;t made</span>
        <span className="text-fg-2">{failureNotice(facts, limitUsd).message}</span>
      </div>
    );
  }
  if (produce.status === "completed" && produce.versionNumber !== null) {
    return (
      <div className="flex flex-col gap-2 rounded-[12px] border border-rule bg-panel px-4 py-3 text-[13px]">
        <span className="flex items-center gap-2 font-medium">
          <span className="size-1.5 rounded-full bg-ready" />
          Version {produce.versionNumber} is ready
        </span>
        {!produce.current && <span className="text-fg-3">You&rsquo;ve changed the skit since. Approve again to make a new version.</span>}
        <div className="flex gap-2">
          <Link href={`/p/${projectId}/review`} className="flex h-8 items-center rounded-lg bg-hover px-3 font-medium">
            Review and share
          </Link>
          <Link href={`/p/${projectId}/export`} className="flex h-8 items-center rounded-lg border border-line-strong px-3 font-medium">
            Download
          </Link>
        </div>
      </div>
    );
  }
  return (
    <p role="status" aria-live="polite" className="flex items-center gap-2 rounded-[12px] border border-rule bg-panel px-4 py-3 text-[13px]">
      <span className={`size-1.5 rounded-full ${state.dot === "accent" ? "animate-pulse bg-accent" : "bg-fg-muted"}`} />
      {state.word === "Queued" ? "Waiting to start…" : "Voicing the lines and drawing the video…"}
    </p>
  );
}

function BeatRow({
  index,
  beat,
  cast,
  onEdit,
}: {
  index: number;
  beat: EditableBeat;
  cast: { id: string; character: string; label?: string }[];
  onEdit: (patch: BeatPatch) => void;
}) {
  const name = (id: string) => {
    const member = cast.find((c) => c.id === id);
    return member ? `${characterName(member.character)}${member.label ? ` · ${member.label}` : ""}` : id;
  };
  const what = beat.silent ? `Beat ${index}, silent` : `Beat ${index}`;

  return (
    <li aria-label={what} className="flex flex-col gap-3 rounded-[12px] border border-rule bg-panel px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-6 font-mono text-xs text-fg-muted">{String(index).padStart(2, "0")}</span>
        {beat.silent ? (
          <span className="text-[13px] text-fg-3">Silent beat{beat.speaker ? ` · ${name(beat.speaker)}` : ""}</span>
        ) : (
          <select aria-label={`${what}: speaker`} value={beat.speaker ?? ""} onChange={(e) => onEdit({ speaker: e.target.value })} className={`${field} h-8`}>
            {beat.speaker && !cast.some((c) => c.id === beat.speaker) && <option value={beat.speaker}>{beat.speaker}</option>}
            {cast.map((c) => (
              <option key={c.id} value={c.id}>
                {name(c.id)}
              </option>
            ))}
          </select>
        )}
        {!beat.silent && (
          <select aria-label={`${what}: expression`} value={beat.expression ?? ""} onChange={(e) => onEdit({ expression: e.target.value })} className={`${field} h-8`}>
            {!beat.expression && <option value="">No expression</option>}
            {stickCatalog.expressions.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        )}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-fg-muted">
          Pause before
          <input
            type="number"
            min={0}
            max={5}
            step={0.1}
            aria-label={`${what}: pause before, in seconds`}
            value={beat.pauseBeforeMs !== undefined ? beat.pauseBeforeMs / 1000 : ""}
            placeholder="0"
            onChange={(e) => onEdit({ pauseBeforeMs: e.target.value === "" ? null : Number(e.target.value) * 1000 })}
            className={`${field} h-8 w-16 font-mono`}
          />
          s
        </label>
      </div>

      {!beat.silent && (
        <textarea
          aria-label={`${what}: line`}
          rows={2}
          value={beat.line ?? ""}
          onChange={(e) => onEdit({ line: e.target.value })}
          className={`${field} w-full resize-none py-2 text-[15px] leading-normal`}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        {beat.slams.map((value, i) => (
          <span key={i} className="flex items-center gap-1 rounded-lg border border-line bg-canvas-script pr-1">
            <input
              aria-label={`${what}: text slam ${i + 1}`}
              value={value}
              onChange={(e) => onEdit({ slams: beat.slams.map((s, j) => (j === i ? e.target.value : s)) })}
              className="h-7 w-32 bg-transparent px-2 font-mono text-xs font-semibold text-fg uppercase outline-none"
            />
            <button
              type="button"
              aria-label={`Remove text slam ${i + 1} from ${what.toLowerCase()}`}
              onClick={() => onEdit({ slams: beat.slams.filter((_, j) => j !== i) })}
              className="size-5 rounded text-fg-muted hover:bg-hover"
            >
              ×
            </button>
          </span>
        ))}
        <button type="button" onClick={() => onEdit({ slams: [...beat.slams, "WAIT"] })} className="h-7 rounded-lg px-2 text-xs text-fg-3 hover:bg-hover">
          + Text slam
        </button>
      </div>
    </li>
  );
}

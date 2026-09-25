"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { StepNav } from "@/components/StepNav";
import { BRIEF_VOICES } from "@/lib/brief-options";
import type { EditModel } from "@/services/edit-model";
import {
  cancelRunAction,
  changeVoiceAction,
  chooseTakeAction,
  dropSceneAction,
  filmNewTakeAction,
  fixCaptionAction,
  moveSceneAction,
  rerecordVoiceAction,
  retryClipAction,
  setTrimAction,
  undoNarrationAction,
  updateNarrationAction,
} from "./actions";
import { ActivityDrawer } from "./ActivityDrawer";
import { ChangeDrawer } from "./ChangeDrawer";
import { ConfirmDialog, type Confirm } from "./ConfirmDialog";
import { Inspector } from "./Inspector";
import { Rail } from "./Rail";
import { FailureBanner, PhonePreview, StageFacts, StageHeader } from "./Stage";
import { usd } from "./shared";
import { Timeline } from "./Timeline";

type ActionResult = { ok: true } | { ok: false; error: string; guard?: string };

export function EditWorkspace({ model }: { model: EditModel }) {
  const router = useRouter();
  const pid = model.project.id;
  const [selectedId, setSelectedId] = useState(model.scenes[0]?.id ?? "");
  const [globalT, setGlobalT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [change, setChange] = useState<{ preset?: string } | null>(null);
  const [activity, setActivity] = useState(false);
  const [trimError, setTrimError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const scenes = model.scenes;
  const scene = scenes.find((s) => s.id === selectedId) ?? scenes[0];
  const starts = useMemo(() => scenes.reduce<number[]>((acc, s, i) => [...acc, i === 0 ? 0 : acc[i - 1] + scenes[i - 1].lengthS], []), [scenes]);

  // Live states: refresh while anything is filming / recording (SSE lives in the worker; this reads its results).
  useEffect(() => {
    if (!model.anyBusy) return;
    const id = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(id);
  }, [model.anyBusy, router]);

  // Playback: one clock across the whole film; the selected scene follows it.
  const tRef = useRef(globalT);
  useEffect(() => { tRef.current = globalT; }, [globalT]);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const next = tRef.current + 0.1;
      if (next >= model.totalLengthS) { setPlaying(false); return; }
      setGlobalT(next);
      const i = starts.findLastIndex((s) => s <= next);
      if (i >= 0 && scenes[i]) setSelectedId(scenes[i].id);
    }, 100);
    return () => clearInterval(id);
  }, [playing, starts, scenes, model.totalLengthS]);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    setPlaying(false);
    const i = scenes.findIndex((s) => s.id === id);
    if (i >= 0) setGlobalT(starts[i]);
  }, [scenes, starts]);

  const step = useCallback((dir: 1 | -1) => {
    const i = scenes.findIndex((s) => s.id === selectedId);
    const next = scenes[i + dir];
    if (next) select(next.id);
  }, [scenes, selectedId, select]);

  // Keys never act while typing in a field (no paid action lives on a key either).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable], dialog, [role=dialog]")) return;
      if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "’" && (e.metaKey || e.ctrlKey)) setActivity(true);
      else if (e.key === "'" && (e.metaKey || e.ctrlKey)) setActivity(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  if (!scene) return <EmptyEdit projectId={pid} />;

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };
  /** Run a server action; surface a refusal (including the spend guard) without throwing. */
  const act = (fn: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) { after?.(); router.refresh(); }
      else flash(r.guard === "project_limit" ? `This would take the video past its ${usd(model.project.limitUsd)} limit.` : r.error);
    });
  const ask = (c: Omit<Confirm, "run"> & { action: () => Promise<ActionResult> }) => {
    setConfirmError(null);
    setConfirm({
      ...c,
      run: () => startTransition(async () => {
        const r = await c.action();
        if (r.ok) { setConfirm(null); router.refresh(); }
        else setConfirmError(r.guard === "project_limit" ? `This would take the video past its ${usd(model.project.limitUsd)} limit.` : r.error);
      }),
    });
  };
  const after = (extra: number) => `This video after: ~${usd(Number(model.spentUsd) + Number(model.inflightUsd) + extra)} of ${usd(model.project.limitUsd)}`;

  const spent = Number(model.spentUsd);
  const onWay = Number(model.inflightUsd);
  const limit = Number(model.project.limitUsd);
  const voiceName = BRIEF_VOICES.find((v) => v.id === model.project.voice)?.name ?? model.project.voice;
  const localT = Math.max(0, globalT - starts[scenes.indexOf(scene)]);
  const needsIdx = model.needsYou;

  return (
    <>
      <header className="flex h-[52px] shrink-0 items-center gap-4 border-b border-rule bg-panel px-4">
        <div className="flex w-[440px] items-center gap-2.5">
          <span aria-hidden className="size-4 rounded bg-accent" />
          <span className="text-sm font-semibold tracking-tight">Studio</span>
          <span className="text-[#3a3a42]">/</span>
          <span className="font-display text-xl text-fg italic">{model.project.title}</span>
          <span className="ml-1 flex items-center gap-1.5 text-xs text-fg-muted"><span className="size-1.5 rounded-full bg-ready" />{pending ? "Saving…" : "Saved"}</span>
        </div>
        <StepNav current="edit" reachable={["brief", "script", "edit", "review", "export"]} projectId={pid} />
        <div className="flex w-[440px] items-center justify-end gap-2.5">
          <div title={`This video: ${usd(spent)} spent, about ${usd(onWay)} on the way, of a ${usd(limit)} limit`} className="flex h-[30px] items-center gap-2 rounded-lg border border-rule bg-raised px-3 text-xs">
            <span className="text-fg-muted">Spent</span>
            <span className="num font-medium">{usd(spent)}</span>
            <span className="num text-fg-muted">/ ${limit}</span>
            <div role="img" aria-label={`${Math.round((spent / limit) * 100)}% of the limit spent, ${Math.round((onWay / limit) * 100)}% on the way`} className="flex h-1 w-14 overflow-hidden rounded-sm bg-[#2a2a30]">
              <div className="bg-accent" style={{ width: `${Math.min(100, (spent / limit) * 100)}%` }} />
              <div className="bg-[#7a3a24]" style={{ width: `${Math.min(100, (onWay / limit) * 100)}%` }} />
            </div>
          </div>
          <Link href={`/p/${pid}/review`} className="flex h-[30px] items-center gap-[7px] rounded-lg px-3 text-[13px] font-medium text-fg-2">Share for review</Link>
          {model.canExport ? (
            <Link href={`/p/${pid}/export`} className="flex h-[30px] items-center rounded-lg border border-line bg-hover px-3.5 text-[13px] font-semibold text-fg">Export</Link>
          ) : (
            <button type="button" aria-disabled="true" title={model.exportBlockedReason ?? undefined} className="h-[30px] cursor-not-allowed rounded-lg border border-line bg-hover px-3.5 text-[13px] font-semibold text-fg-muted">Export</button>
          )}
        </div>
      </header>

      <div className="flex h-[676px] shrink-0 border-b border-rule">
        <Rail
          scene={scene}
          model={model}
          onChooseTake={(takeId) => act(() => chooseTakeAction(pid, scene.id, takeId))}
          onNewTake={() => ask({ title: "Film a new take", body: `A fresh take of scene ${scene.position}. Your current take stays, and you can switch back any time.`, priceUsd: model.prices.clip, confirmLabel: "Film new take", after: after(Number(model.prices.clip)), action: () => filmNewTakeAction(pid, scene.id) })}
          onPickVoice={(voiceId) => {
            const total = scenes.length * Number(model.prices.narrate);
            ask({ title: `Change the voice to ${BRIEF_VOICES.find((v) => v.id === voiceId)?.name}`, body: `Every scene’s narration is recorded again in the new voice (${scenes.length} scenes). Your captions and timing follow the new voice.`, priceUsd: total.toFixed(6), confirmLabel: "Change voice", after: after(total), action: () => changeVoiceAction(pid, voiceId) });
          }}
        />

        <section aria-label="Preview" className="flex min-w-0 flex-1 flex-col">
          <StageHeader
            scene={scene}
            total={scenes.length}
            needsYou={needsIdx.length}
            onNeedsYou={() => { const cur = needsIdx.indexOf(scene.id); select(needsIdx[(cur + 1) % needsIdx.length]); }}
          />
          <FailureBanner
            scene={scene}
            onRetry={() => ask({ title: "Try filming again", body: "The same shot, sent again.", priceUsd: model.prices.clip, confirmLabel: "Try again", after: after(Number(model.prices.clip)), action: () => retryClipAction(pid, scene.id) })}
            onAsk={() => setChange({})}
            onRaise={() => flash("Only the owner can raise the limit — that lives in project settings, coming later.")}
          />
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-7 px-7" style={{ background: "radial-gradient(circle at 50% 42%, #15151a 0%, #0a0a0c 70%)" }}>
            <StageFacts scene={scene} voiceName={voiceName} globalT={globalT} total={model.totalLengthS} />
            <div className="order-2 col-start-2 row-start-1">
              <PhonePreview scene={scene} localT={localT} playing={playing} progress={scene.lengthS ? localT / scene.lengthS : 0} onToggle={() => setPlaying((p) => !p)} onPrev={() => step(-1)} onNext={() => step(1)} />
            </div>
          </div>
        </section>

        <Inspector
          key={`${scene.id}|${scene.narration}|${scene.visualPrompt}|${scene.trimStartS}|${scene.trimEndS}|${scene.voiceOutOfDate}`}
          scene={scene}
          model={model}
          trimError={trimError}
          onSaveNarration={(text) => act(() => updateNarrationAction(pid, scene.id, text))}
          onUndoNarration={() => act(() => undoNarrationAction(pid, scene.id))}
          onRerecord={() => ask({ title: "Re-record the voice", body: `Scene ${scene.position} will be recorded again with the new words in ${voiceName}.`, priceUsd: model.prices.narrate, confirmLabel: "Re-record", after: after(Number(model.prices.narrate)), action: () => rerecordVoiceAction(pid, scene.id) })}
          onRefilm={(prompt) => ask({ title: "Refilm this scene", body: `A new take of scene ${scene.position} from what you wrote. Your current take stays.`, priceUsd: model.prices.clip, confirmLabel: "Refilm", after: after(Number(model.prices.clip)), action: () => filmNewTakeAction(pid, scene.id, prompt) })}
          onAsk={(preset) => setChange({ preset })}
          onFixCaption={(i, text) => act(() => fixCaptionAction(pid, scene.id, i, text))}
          onTrim={(a, b) => { setTrimError(null); startTransition(async () => { const r = await setTrimAction(pid, scene.id, a, b); if (r.ok) router.refresh(); else setTrimError(r.error); }); }}
          onMove={(dir) => act(() => moveSceneAction(pid, scene.id, dir))}
          onDrop={() => act(() => dropSceneAction(pid, scene.id), () => setSelectedId(scenes.find((s) => s.id !== scene.id)?.id ?? ""))}
          onActivity={() => setActivity(true)}
          onCancel={(runId) => act(() => cancelRunAction(pid, runId))}
        />
      </div>

      <Timeline model={model} selectedId={scene.id} globalT={globalT} onSelect={select} />

      {confirm && <ConfirmDialog confirm={confirm} busy={pending} error={confirmError} onClose={() => setConfirm(null)} />}
      {change && <ChangeDrawer projectId={pid} scene={scene} preset={change.preset} onClose={() => setChange(null)} onDone={() => { setChange(null); router.refresh(); }} />}
      {activity && <ActivityDrawer model={model} onClose={() => setActivity(false)} onSelect={select} />}
      {toast && <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-line bg-panel px-4 py-2.5 text-[13px] shadow-xl">{toast}</div>}
    </>
  );
}

function EmptyEdit({ projectId }: { projectId: string }) {
  return (
    <main className="flex flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="font-display text-[32px]">No scenes yet</h1>
        <Link href={`/p/${projectId}/script`} className="text-sm text-accent-link">Back to the script</Link>
      </div>
    </main>
  );
}

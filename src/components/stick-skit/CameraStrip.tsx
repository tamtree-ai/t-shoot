"use client";

import type { DraftCut } from "stickstage";

import type { EditableBeat } from "@/types/stick-skit/draft";

const chip = "h-7 shrink-0 rounded-md border px-2 text-[11px]";

function label(cut: DraftCut, nameOf: (id: string) => string): string {
  if (cut.kind === "punch-in") return cut.on ? `punch-in ${nameOf(cut.on)}` : "punch-in";
  if ((cut.framing === "close" || cut.framing === "medium" || cut.framing === "extreme") && cut.on) return `${cut.framing} on ${nameOf(cut.on)}`;
  return cut.framing;
}

/**
 * The director's cuts under the preview. A chip seeks the player. The beat under the
 * playhead can pin two / close / wide, drop its reaction, or nudge the pause by 300 ms.
 */
export function CameraStrip({
  cuts,
  frame,
  beat,
  nameOf,
  onSeek,
  onPin,
  onReaction,
  onPause,
}: {
  cuts: DraftCut[];
  frame: number;
  beat: EditableBeat | null;
  nameOf: (id: string) => string;
  onSeek: (frame: number) => void;
  onPin: (framing: "two" | "close" | "wide") => void;
  onReaction: () => void;
  onPause: (deltaMs: number) => void;
}) {
  const active = [...cuts].reverse().find((c) => c.frame <= frame);
  return (
    <div className="flex flex-col gap-1.5 px-1">
      <div className="flex gap-1 overflow-x-auto pb-0.5">
        {cuts.map((cut, i) => {
          const on = cut === active;
          return (
            <button
              key={`${cut.scene}-${cut.frame}-${cut.kind}-${i}`}
              type="button"
              title={cut.reason}
              onClick={() => onSeek(cut.frame)}
              className={`${chip} ${on ? "border-accent bg-accent-soft text-fg" : "border-line text-fg-2"}`}
            >
              {label(cut, nameOf)}
            </button>
          );
        })}
      </div>
      {beat && (
        <div className="flex flex-wrap items-center gap-1">
          {(["two", "close", "wide"] as const).map((framing) => {
            const pinned = beat.shot?.framing === framing;
            const disabled = framing === "close" && !beat.speaker;
            return (
              <button
                key={framing}
                type="button"
                disabled={disabled}
                onClick={() => onPin(framing)}
                className={`${chip} ${pinned ? "border-accent text-fg" : "border-line text-fg-3"} disabled:opacity-40`}
              >
                {framing === "two" ? "Pin two" : framing === "close" ? "Pin close" : "Pin wide"}
              </button>
            );
          })}
          <button type="button" onClick={onReaction} className={`${chip} ${beat.reaction === false ? "border-accent text-fg" : "border-line text-fg-3"}`}>
            No reaction
          </button>
          <button type="button" onClick={() => onPause(-300)} className={`${chip} border-line text-fg-3`}>
            −0.3s
          </button>
          <button type="button" onClick={() => onPause(300)} className={`${chip} border-line text-fg-3`}>
            +0.3s
          </button>
        </div>
      )}
    </div>
  );
}

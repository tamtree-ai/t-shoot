/**
 * The stage-flow I/O contract (provisional v0).
 *
 * Tamshoot defines this contract; the `shortvideo` plugin's stage flows (Track P, S1)
 * must produce exactly these shapes. Mirrored in
 * agent-orchestrator changes/2026-09-25-short-video-studio/07-frontend-first.md §2 —
 * change both together.
 *
 * Cost is never part of an output: money comes only from RunOut.total_cost_usd (A1).
 */
import { z } from "zod";

export const STAGE_FLOWS = ["studio-script", "studio-narrate", "studio-clip", "studio-render"] as const;
export type StageFlow = (typeof STAGE_FLOWS)[number];

export const Beat = z.object({
  narration: z.string().min(1),
  visual_prompt: z.string().min(1),
});
export type Beat = z.infer<typeof Beat>;

export const Brief = z.object({
  topic: z.string().min(1),
  length_s: z.union([z.literal(30), z.literal(45), z.literal(60)]),
  tone: z.string(),
  look: z.string(),
  voice: z.string(),
});
export type Brief = z.infer<typeof Brief>;

// studio-script ────────────────────────────────────────────────────────────
export const ScriptIn = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("draft"), brief: Brief }),
  z.object({ mode: z.literal("revise"), beats: z.array(Beat).min(1), note: z.string().min(1) }),
  z.object({
    mode: z.literal("revise-scene"),
    beat: Beat,
    note: z.string().min(1),
    prev: z.string().optional(),
    next: z.string().optional(),
  }),
]);
export type ScriptIn = z.infer<typeof ScriptIn>;

export const ScriptBeatsOut = z.object({
  beats: z.array(Beat).min(1),
  changed: z.array(z.boolean()).optional(),
});
export const ScriptSceneOut = z.object({
  beat: Beat,
  changed: z.object({ narration: z.boolean(), visual_prompt: z.boolean() }),
});
export const ScriptOut = z.union([ScriptBeatsOut, ScriptSceneOut]);
export type ScriptOut = z.infer<typeof ScriptOut>;

// studio-narrate — one scene ──────────────────────────────────────────────
export const NarrateIn = z.object({
  scene_key: z.string().min(1),
  phrases: z.array(z.string().min(1)).min(1),
  voice: z.string().min(1),
});
export type NarrateIn = z.infer<typeof NarrateIn>;

export const NarrateOut = z.object({
  asset_id: z.string().min(1),
  duration_s: z.number().positive(),
  reused: z.boolean(),
  phrases: z.array(z.object({ text: z.string(), start_s: z.number(), end_s: z.number() })),
});
export type NarrateOut = z.infer<typeof NarrateOut>;

// studio-clip — one scene, one take ───────────────────────────────────────
// `take` is part of the input on purpose: `shortvideo.reuse` keys on an input digest,
// so without it "New take" would be served the same clip back for free. "Try again"
// after a failure re-sends the SAME take number.
export const ClipIn = z.object({
  scene_key: z.string().min(1),
  visual_prompt: z.string().min(1),
  seconds: z.number().positive(),
  take: z.number().int().positive(),
});
export type ClipIn = z.infer<typeof ClipIn>;

export const ClipOut = z.object({
  asset_id: z.string().min(1),
  duration_s: z.number().positive(),
  reused: z.boolean(),
});
export type ClipOut = z.infer<typeof ClipOut>;

// studio-render ───────────────────────────────────────────────────────────
// `timeline` is a TimelineV1 document (video-generation 02-timeline-v1.md, frozen
// 1080×1920 @ 30fps). Typed loosely here; the zod TimelineV1 lands with the Edit screen.
export const RenderIn = z.object({
  timeline: z.record(z.string(), z.unknown()),
  mode: z.enum(["draft", "final"]),
});
export type RenderIn = z.infer<typeof RenderIn>;

export const RenderOut = z.object({
  asset_id: z.string().min(1),
  digest: z.string().min(1),
  duration_s: z.number().positive(),
});
export type RenderOut = z.infer<typeof RenderOut>;

export type StageInput = {
  "studio-script": ScriptIn;
  "studio-narrate": NarrateIn;
  "studio-clip": ClipIn;
  "studio-render": RenderIn;
};
export type StageOutput = {
  "studio-script": ScriptOut;
  "studio-narrate": NarrateOut;
  "studio-clip": ClipOut;
  "studio-render": RenderOut;
};

export const stageOutputSchema = {
  "studio-script": ScriptOut,
  "studio-narrate": NarrateOut,
  "studio-clip": ClipOut,
  "studio-render": RenderOut,
} as const satisfies Record<StageFlow, z.ZodType>;

/** The output port every stage flow writes its single result item to. */
export const STAGE_OUTPUT_PORT = "result";

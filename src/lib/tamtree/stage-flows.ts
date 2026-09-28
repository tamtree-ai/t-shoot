/**
 * The stage-flow I/O contract (provisional v0).
 *
 * t-shoot defines this contract; the `shortvideo` plugin's stage flows (Track P, S1) and
 * the `stickstage` plugin's (`stage-flows/`) must produce exactly these shapes. Mirrored in
 * agent-orchestrator changes/2026-09-25-short-video-studio/07-frontend-first.md §2 —
 * change both together.
 *
 * Cost is never part of an output: money comes only from RunOut.total_cost_usd (A1).
 */
import { TEMPLATES } from "stickstage/schema";
import { z } from "zod";

/** `ai_clips`'s flows (the `shortvideo` plugin). */
export const STUDIO_FLOWS = ["studio-script", "studio-narrate", "studio-clip", "studio-render"] as const;
/** `stick_skit`'s flows (the `stickstage` plugin's `stage-flows/`). */
export const STICK_FLOWS = ["stick-script", "stick-produce"] as const;
/** One post, one platform. Tamtree owns the upload; t-shoot owns the draft. */
export const PUBLISH_FLOWS = ["studio-publish"] as const;
/** Short writer calls: topics, hooks, titles, translation. Not a production stage. */
export const TEXT_FLOWS = ["studio-topics", "studio-hooks", "studio-titles", "studio-translate"] as const;
export const STAGE_FLOWS = [...STUDIO_FLOWS, ...STICK_FLOWS, ...PUBLISH_FLOWS, ...TEXT_FLOWS] as const;
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

// stick-script / stick-produce (09 §5) ──────────────────────────────────────
// A skit is StickStage's document: validated by the `stickstage` package in-process and by
// the render service, so the contract only requires it to be an object. Both flows refuse a
// `catalog_version` the service doesn't have before anything is paid for.
export const Skit = z.record(z.string(), z.unknown());
export type Skit = z.infer<typeof Skit>;

export const StickCast = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/),
  character: z.string().min(1),
  label: z.string().min(1).max(24).optional(),
});
export type StickCast = z.infer<typeof StickCast>;

export const StickBrief = z.object({
  topic: z.string().min(1),
  description: z.string().max(2000).optional(),
  /** Unset: the script model picks one that fits the cast. */
  template: z.enum(TEMPLATES).optional(),
  cast: z.array(StickCast).min(1).max(2),
  /** Unset: the script model picks from `allowed_sets` (or the whole catalog). */
  set: z.string().optional(),
  /**
   * Several scenes, each on its own set (StickStage `scenes[]`). Unset: one scene.
   * The writer keeps this count; a reply that disagrees is split to fit.
   */
  scenes: z.number().int().min(2).max(4).optional(),
  /** With `scenes`: the sets to move through, in order. Scenes past the list: the model picks. */
  sets: z.array(z.string()).min(1).max(4).optional(),
  /** v0 extension: the workspace's allowed sets, so the model never picks another. */
  allowed_sets: z.array(z.string()).optional(),
  tone: z.string().optional(),
  /** How long the owner hopes the skit runs. Omitted from the writer call. */
  target_s: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60)]).optional(),
  /** Workspace characters. Staging copies them onto the skit, ahead of the catalog. */
  characters: z.array(z.record(z.string(), z.unknown())).max(4).optional(),
});
export type StickBrief = z.infer<typeof StickBrief>;

export const StickScriptIn = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("draft"), catalog_version: z.string().min(1), brief: StickBrief }),
  z.object({ mode: z.literal("revise"), catalog_version: z.string().min(1), skit: Skit, note: z.string().min(1) }),
]);
export type StickScriptIn = z.infer<typeof StickScriptIn>;

export const StickLine = z.object({
  id: z.string().min(1),
  speaker: z.string().min(1),
  character: z.string(),
  text: z.string().min(1),
  delivery: z.string().optional(),
});
export type StickLine = z.infer<typeof StickLine>;

export const StickCheck = z.object({
  ok: z.boolean(),
  errors: z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(),
  findings: z.array(z.record(z.string(), z.unknown())),
});
export type StickCheck = z.infer<typeof StickCheck>;

export const StickScriptOut = z.object({
  /** Draft only: the premise the model wrote, for the record. */
  premise: z.record(z.string(), z.unknown()).optional(),
  /** Staged by StickStage `/validate`. */
  skit: Skit,
  lines: z.array(StickLine),
  estimated_duration_s: z.number().nonnegative(),
  check: StickCheck,
  warnings: z.array(z.string()),
});
export type StickScriptOut = z.infer<typeof StickScriptOut>;

export const StickProduceIn = z.object({
  catalog_version: z.string().min(1),
  /** The approved draft, as the owner left it. */
  skit: Skit,
  /** character → TTS voice, from `type_settings`. */
  voices: z.record(z.string(), z.string().min(1)),
});
export type StickProduceIn = z.infer<typeof StickProduceIn>;

export const StickProduceOut = z.object({
  mp4_asset_id: z.string().min(1),
  srt_asset_id: z.string().min(1),
  txt_asset_id: z.string().min(1),
  manifest_asset_id: z.string().min(1),
  duration_s: z.number().positive(),
  /** SHA-256 of the MP4. */
  digest: z.string().min(1),
  /** The AI-voice labelling note to show before posting. */
  reminder: z.string().optional(),
  /** The compiler's cover and thumbnail, when the render wrote them. */
  cover_asset_id: z.string().min(1).optional(),
  thumbnail_asset_id: z.string().min(1).optional(),
});
export type StickProduceOut = z.infer<typeof StickProduceOut>;

export const PublishIn = z.object({
  platform: z.enum(["youtube", "instagram", "tiktok"]),
  title: z.string(),
  description: z.string(),
  hashtags: z.string(),
  tags: z.string(),
  privacy: z.enum(["public", "unlisted", "private"]),
  ai_generated: z.boolean(),
  category_id: z.string(),
  scheduled_at: z.string().nullable(),
  asset_id: z.string().min(1),
});
export type PublishIn = z.infer<typeof PublishIn>;

export const PublishOut = z.object({
  url: z.string().nullable(),
  result: z.string(),
});
export type PublishOut = z.infer<typeof PublishOut>;

export const TopicsIn = z.object({
  url: z.string().min(1),
  text: z.string().min(1),
  heading: z.string().optional(),
});
export type TopicsIn = z.infer<typeof TopicsIn>;

export const TopicsOut = z.object({
  topics: z.array(z.object({ title: z.string().min(1), line: z.string().min(1) })).min(1).max(5),
});
export type TopicsOut = z.infer<typeof TopicsOut>;

export const HooksIn = z.object({
  line: z.string().min(1),
  topic: z.string().min(1),
});
export type HooksIn = z.infer<typeof HooksIn>;

export const HooksOut = z.object({
  hooks: z.array(z.string().min(1)).length(3),
});
export type HooksOut = z.infer<typeof HooksOut>;

export const TitlesIn = z.object({
  title: z.string().min(1),
  lines: z.array(z.string()).default([]),
});
export type TitlesIn = z.infer<typeof TitlesIn>;

export const TitlesOut = z.object({
  pairs: z.array(z.object({
    title: z.string().min(1),
    cover: z.enum(["opening", "slam", "end"]),
  })).length(3),
});
export type TitlesOut = z.infer<typeof TitlesOut>;

export const TranslateIn = z.object({
  language: z.string().min(2),
  title: z.string().min(1),
  lines: z.array(z.object({ id: z.string(), text: z.string() })).min(1),
  slams: z.array(z.object({ beatId: z.string(), values: z.array(z.string()) })).default([]),
  hashtags: z.array(z.string()).default([]),
});
export type TranslateIn = z.infer<typeof TranslateIn>;

export const TranslateOut = z.object({
  language: z.string(),
  title: z.string(),
  lines: z.array(z.object({ id: z.string(), text: z.string() })),
  slams: z.array(z.object({ beatId: z.string(), values: z.array(z.string()) })),
  hashtags: z.array(z.string()),
  warning: z.string().optional(),
});
export type TranslateOut = z.infer<typeof TranslateOut>;

export type StageInput = {
  "studio-script": ScriptIn;
  "studio-narrate": NarrateIn;
  "studio-clip": ClipIn;
  "studio-render": RenderIn;
  "stick-script": StickScriptIn;
  "stick-produce": StickProduceIn;
  "studio-publish": PublishIn;
  "studio-topics": TopicsIn;
  "studio-hooks": HooksIn;
  "studio-titles": TitlesIn;
  "studio-translate": TranslateIn;
};
export type StageOutput = {
  "studio-script": ScriptOut;
  "studio-narrate": NarrateOut;
  "studio-clip": ClipOut;
  "studio-render": RenderOut;
  "stick-script": StickScriptOut;
  "stick-produce": StickProduceOut;
  "studio-publish": PublishOut;
  "studio-topics": TopicsOut;
  "studio-hooks": HooksOut;
  "studio-titles": TitlesOut;
  "studio-translate": TranslateOut;
};

export const stageOutputSchema = {
  "studio-script": ScriptOut,
  "studio-narrate": NarrateOut,
  "studio-clip": ClipOut,
  "studio-render": RenderOut,
  "stick-script": StickScriptOut,
  "stick-produce": StickProduceOut,
  "studio-publish": PublishOut,
  "studio-topics": TopicsOut,
  "studio-hooks": HooksOut,
  "studio-titles": TitlesOut,
  "studio-translate": TranslateOut,
} as const satisfies Record<StageFlow, z.ZodType>;

/** The output port every stage flow writes its single result item to. */
export const STAGE_OUTPUT_PORT = "result";

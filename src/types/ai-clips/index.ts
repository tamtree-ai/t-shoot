/**
 * `ai_clips`: a narrated short cut from AI-generated clips — the type Track F built.
 * Moved behind the registry in T1 with no change in behaviour; its flow keys are the
 * `studio-*` flows already published, so nothing is renamed.
 */
import { z } from "zod";

import { estimateFilming, type FilmingEstimate } from "@/lib/estimate";
import { Beat, Brief } from "@/lib/tamtree/stage-flows";
import type { ProductionType } from "../types";
import { BRIEF_LENGTHS, BRIEF_LOOKS, BRIEF_TONES, BRIEF_VOICES } from "./catalog";

const VOICE_IDS = BRIEF_VOICES.map((v) => v.id) as [string, ...string[]];
const LOOK_IDS = BRIEF_LOOKS.map((l) => l.id) as [string, ...string[]];

/**
 * What an org allows for AI clips (08, decision 4): the brief's preselected voice and look,
 * the longest video it may ask for, and the spend cap — the most any one video's limit may
 * be. Every field has a default, so an org that never saved settings parses to these.
 */
export const AiClipsDefaults = z.object({
  default_voice: z.enum(VOICE_IDS).default(VOICE_IDS[0]),
  default_look: z.enum(LOOK_IDS).default(LOOK_IDS[0]),
  max_length_s: z.union([z.literal(30), z.literal(45), z.literal(60)]).default(60),
  limit_usd: z
    .string()
    .regex(/^\d{1,4}(\.\d{1,2})?$/, "A spend cap is dollars and cents, like 5.00.")
    .refine((v) => Number(v) > 0, "A spend cap must be more than $0.")
    .default("5.00"),
});
export type AiClipsDefaults = z.infer<typeof AiClipsDefaults>;

/** Why a brief breaks the org's defaults, or null if it fits. Checked again on the server. */
export function briefOutsideDefaults(brief: Brief, limitUsd: string, d: AiClipsDefaults): string | null {
  if (brief.length_s > d.max_length_s) return `Videos in this workspace can be up to ${d.max_length_s}s.`;
  if (!(Number(limitUsd) > 0)) return "Set a limit for this video.";
  if (Number(limitUsd) > Number(d.limit_usd)) return `This workspace caps a video at $${d.limit_usd}.`;
  return null;
}

/** The draft the human gate approves: the script's beats, in film order. */
const AiClipsDraft = z.array(Beat).min(1);
type AiClipsDraft = z.infer<typeof AiClipsDraft>;

const CATALOG = { lengths: BRIEF_LENGTHS, tones: BRIEF_TONES, voices: BRIEF_VOICES, looks: BRIEF_LOOKS };

export const aiClips = {
  kind: "ai_clips",
  label: "AI clips",
  steps: ["brief", "script", "edit", "review", "export"],
  configSchema: Brief,
  tenantDefaultsSchema: AiClipsDefaults,
  catalog: async () => CATALOG,
  // The catalog is code, not an engine's: it changes only with a deploy.
  catalogVersion: () => "1",
  flows: {
    script: "studio-script",
    narrate: "studio-narrate",
    clip: "studio-clip",
    render: "studio-render",
  },
  draftSchema: AiClipsDraft,
  // No scene is known to be a reuse hit before filming, so every one is priced.
  estimate: (draft) => estimateFilming(draft.map(() => ({ reused: false }))),
} as const satisfies ProductionType<Brief, AiClipsDraft, AiClipsDefaults, typeof CATALOG, FilmingEstimate>;

/** The project's narration voice. It lives in the brief (migration 0003 dropped `projects.voice`). */
export function aiClipsVoice(project: { brief: Record<string, unknown> }): string {
  return String(project.brief.voice ?? "");
}

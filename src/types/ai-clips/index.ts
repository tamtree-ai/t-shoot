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

/** Owner defaults for this type arrive with `type_settings` (T2/T3); none yet. */
const AiClipsDefaults = z.object({});
type AiClipsDefaults = z.infer<typeof AiClipsDefaults>;

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

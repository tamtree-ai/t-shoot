/**
 * `stick_skit`: a stick-figure comedy skit, written by the script model and drawn by
 * StickStage (09 §4–§6). The catalog is StickStage's own and is pinned per project by its
 * content version; the paid work is `stick-script` (the draft, ~$0.01) and `stick-produce`
 * (TTS per line; the render is StickStage CPU and not metered).
 */
import { TEMPLATES } from "stickstage/schema";
import { z } from "zod";

import { STICK_LINE_PRICE_USD } from "@/lib/estimate";
import { Skit, StickBrief, StickLine } from "@/lib/tamtree/stage-flows";
import { spendCap, type ProductionType } from "../types";
import { DEFAULT_VOICE_MAP, STICK_VOICES, stickCatalog } from "./catalog";

const CHARACTER_IDS = stickCatalog.characters.map((c) => c.id);
const SET_IDS = stickCatalog.sets.map((s) => s.id);
const VOICE_IDS = STICK_VOICES.map((v) => v.id) as [string, ...string[]];

/** Keeps only ids the pinned catalog still has, so settings saved before a catalog change still parse. */
const knownIds = (known: string[], none: string) =>
  z.preprocess((v) => (Array.isArray(v) ? v.filter((id) => known.includes(id)) : v), z.array(z.string()).min(1, none));

/**
 * What an org allows for stick-figure skits (09 §4): the sets and characters a brief can
 * pick from, the voice each character speaks with, the template a brief starts on (unset:
 * the script model picks), the spend cap, and a hashtag line for the caption.
 */
export const StickSkitDefaults = z
  .object({
    allowed_sets: knownIds(SET_IDS, "Allow at least one set.").default(SET_IDS),
    allowed_characters: knownIds(CHARACTER_IDS, "Allow at least one character.").default(CHARACTER_IDS),
    voice_map: z.record(z.string(), z.enum(VOICE_IDS)).default(DEFAULT_VOICE_MAP),
    default_template: z.enum(TEMPLATES).optional(),
    limit_usd: spendCap("1.00"),
    hashtags_suffix: z.string().trim().max(200).optional(),
  })
  .refine((d) => d.allowed_characters.every((c) => d.voice_map[c]), {
    message: "Give every allowed character a voice.",
    path: ["voice_map"],
  });
export type StickSkitDefaults = z.infer<typeof StickSkitDefaults>;

/** Why a brief breaks the catalog or the org's defaults, or null if it fits. Checked again on the server. */
export function stickBriefOutsideDefaults(brief: StickBrief, limitUsd: string, d: StickSkitDefaults): string | null {
  const ids = brief.cast.map((c) => c.id);
  if (new Set(ids).size !== ids.length) return "Each cast member needs their own name.";
  for (const member of brief.cast) {
    if (!d.allowed_characters.includes(member.character)) return `${member.character} isn't available in this workspace.`;
  }
  if (brief.set && !d.allowed_sets.includes(brief.set)) return "That set isn't available in this workspace.";
  if (brief.scenes && brief.set) return "Pick one set, or a set per scene, not both.";
  if (brief.sets) {
    if (!brief.scenes) return "Pick how many scenes before picking their sets.";
    if (brief.sets.length > brief.scenes) return `Pick at most ${brief.scenes} sets, one per scene.`;
    if (new Set(brief.sets).size !== brief.sets.length) return "Give each scene its own set.";
    if (brief.sets.some((s) => !d.allowed_sets.includes(s))) return "That set isn't available in this workspace.";
  }
  const template = brief.template && stickCatalog.templates.find((t) => t.id === brief.template);
  if (template && template.cast !== brief.cast.length) {
    return `That format needs ${template.cast === 1 ? "one character" : "two characters"}.`;
  }
  // The engine refuses an unlabelled me-vs-me: viewers must tell the two selves apart.
  if (brief.template === "me-vs-me" && brief.cast.some((c) => !c.label)) return "Give both sides a label, like “me” and “my brain”.";
  if (!(Number(limitUsd) > 0)) return "Set a limit for this video.";
  if (Number(limitUsd) > Number(d.limit_usd)) return `This workspace caps a video at $${d.limit_usd}.`;
  return null;
}

/** The draft the human gate approves: the staged skit and its spoken lines. */
const StickSkitDraft = z.object({ skit: Skit, lines: z.array(StickLine).min(1) });
type StickSkitDraft = z.infer<typeof StickSkitDraft>;

/** `project_versions.payload` for a made skit (09 §3). */
export type StickVersionPayload = {
  skit: Skit;
  voices: Record<string, string>;
  catalog_version: string;
  /** Asset ids of the render's four files. */
  render: { mp4: string; srt: string; txt: string; manifest: string };
  duration_s: number;
  /** SHA-256 of the MP4, as the flow reported it. */
  mp4_digest: string;
  reminder?: string;
};

export type StickEstimate = { lineCount: number; totalUsd: number; renderIncluded: true };

/** Making the video: TTS per spoken line. The render is StickStage CPU, "render included". */
export function estimateProduce(lineCount: number): StickEstimate {
  return { lineCount, totalUsd: Math.round(lineCount * STICK_LINE_PRICE_USD * 1e6) / 1e6, renderIncluded: true };
}

export const stickSkit = {
  kind: "stick_skit",
  label: "Stick-figure skit",
  // No timeline: the skit is the edit. Review and export are F5's, shared.
  steps: ["brief", "script", "review", "export"],
  configSchema: StickBrief,
  tenantDefaultsSchema: StickSkitDefaults,
  catalog: async (version?: string) => {
    if (version && version !== stickCatalog.version) {
      throw new Error(`This project was written against catalog ${version}; Studio now ships ${stickCatalog.version}.`);
    }
    return stickCatalog;
  },
  catalogVersion: () => stickCatalog.version,
  flows: { script: "stick-script", produce: "stick-produce" },
  draftSchema: StickSkitDraft,
  versionSource: "produce",
  estimate: (draft) => estimateProduce(draft.lines.length),
} as const satisfies ProductionType<StickBrief, StickSkitDraft, StickSkitDefaults, typeof stickCatalog, StickEstimate>;

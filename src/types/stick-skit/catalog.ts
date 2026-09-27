/**
 * The `stick_skit` catalog: StickStage's own (characters, sets, templates), pinned by its
 * content version, plus the TTS voices a character can be given. Client-safe.
 */
import { stickCatalog } from "@/lib/stick/registry";

export { stickCatalog };
export type StickCatalog = typeof stickCatalog;

/** The TTS voices a workspace can map a character to (names as the TTS provider spells them). */
export const STICK_VOICES = [
  { id: "Puck", desc: "Bright · upbeat" },
  { id: "Kore", desc: "Firm · even" },
  { id: "Zephyr", desc: "Warm · light" },
  { id: "Charon", desc: "Deep · steady" },
] as const;

/**
 * A voice for every character the catalog has or is about to have. Settings parse
 * `allowed_characters` as the whole catalog, so a character with no voice here stops
 * an org that has never saved settings from loading.
 *
 * Four TTS voices, six people. Each pair that shares a stage gets two different ones:
 * Milo/June, Lila/Theo, Moss/Dash.
 */
export const DEFAULT_VOICE_MAP: Record<string, string> = {
  milo: "Puck", // earnest
  june: "Kore", // deadpan
  lila: "Zephyr", // a child, light
  theo: "Puck", // eager
  moss: "Charon", // unhurried
  dash: "Kore", // already sure
};

/**
 * Writer-contract batch 3. Until that flow is provisioned, a live `stick-script`
 * ignores `scenes` and returns one scene, so the brief does not offer the choice.
 */
export const MULTI_SCENE_WRITER_LIVE = false;

/** "cafe-1" → "Cafe", "street-night-1" → "Street night", "living-2" → "Living 2". */
export function setLabel(id: string): string {
  const words = id.replace(/-1$/, "").split("-");
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function characterName(id: string): string {
  return stickCatalog.characters.find((c) => c.id === id)?.name ?? id;
}

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

/** The plugin's starting pair: Milo the sincere straight man, June the deadpan one. */
export const DEFAULT_VOICE_MAP: Record<string, string> = { milo: "Puck", june: "Kore" };

/** "cafe-1" → "Cafe", "street-night-1" → "Street night", "living-2" → "Living 2". */
export function setLabel(id: string): string {
  const words = id.replace(/-1$/, "").split("-");
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function characterName(id: string): string {
  return stickCatalog.characters.find((c) => c.id === id)?.name ?? id;
}

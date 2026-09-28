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
  { id: "Fenrir", desc: "Low · dry" },
  { id: "Aoede", desc: "Clear · quick" },
  { id: "Leda", desc: "Soft · close" },
  { id: "Orus", desc: "Even · warm" },
] as const;

/**
 * A voice for every character the catalog has or is about to have. Settings parse
 * `allowed_characters` as the whole catalog, so a character with no voice here stops
 * an org that has never saved settings from loading.
 *
 * Eight TTS voices, six people. Each character has a voice of their own.
 */
export const DEFAULT_VOICE_MAP: Record<string, string> = {
  milo: "Puck", // earnest
  june: "Kore", // deadpan
  lila: "Zephyr", // a child, light
  theo: "Charon", // eager
  moss: "Fenrir", // unhurried
  dash: "Aoede", // already sure
};

/**
 * Writer-contract batch 3. Until that flow is provisioned, a live `stick-script`
 * ignores `scenes` and returns one scene, so the brief does not offer the choice.
 */
export const MULTI_SCENE_WRITER_LIVE = false;

/** Names a person would say. The rest fall back to the catalog id, without the trailing "-1". */
const SET_NAMES: Record<string, string> = {
  "plain-1": "Plain",
  "living-1": "Living room",
  "living-2": "Second living room",
  "lounge-1": "Lounge",
  "office-1": "Office",
  "park-1": "Sunny park",
  "park-2": "Autumn park",
  "street-1": "Street",
  "street-night-1": "Night street",
  "kitchen-1": "Kitchen",
  "bedroom-1": "Bedroom",
  "cafe-1": "Cafe",
  "classroom-1": "Classroom",
  "meeting-1": "Meeting room",
  "beach-1": "Beach",
  "stage-1": "Stage",
};

/** "cafe-1" → "Cafe". Ids without a friendly name drop the trailing "-1". */
export function setLabel(id: string): string {
  if (SET_NAMES[id]) return SET_NAMES[id];
  const words = id.replace(/-1$/, "").split("-");
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function characterName(id: string): string {
  return stickCatalog.characters.find((c) => c.id === id)?.name ?? id;
}

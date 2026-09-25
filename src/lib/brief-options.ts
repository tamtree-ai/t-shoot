/** The Brief screen's fixed choices (03 §1.1, `Brief.dc.html`), shared with Script's voice line. */
export const BRIEF_LENGTHS = [30, 45, 60] as const;
export const BRIEF_TONES = ["Curious", "Playful", "Calm", "Urgent"];

export const BRIEF_VOICES = [
  { id: "zephyr", name: "Zephyr", desc: "Warm · even" },
  { id: "kore", name: "Kore", desc: "Calm · narrator" },
  { id: "puck", name: "Puck", desc: "Bright · upbeat" },
  { id: "charon", name: "Charon", desc: "Deep · steady" },
] as const;

export const BRIEF_LOOKS = [
  { id: "nature-documentary", label: "Nature documentary", gradient: "linear-gradient(160deg, #1B4058 0%, #0A1C28 100%)" },
  { id: "clean-studio", label: "Clean studio", gradient: "linear-gradient(160deg, #2A2A30 0%, #141417 100%)" },
  { id: "warm-and-bold", label: "Warm and bold", gradient: "linear-gradient(160deg, #6A3526 0%, #26140F 100%)" },
  { id: "moody-macro", label: "Moody macro", gradient: "linear-gradient(160deg, #4A2E5A 0%, #150C1A 100%)" },
] as const;

export function voiceLabel(voiceId: string): string {
  const voice = BRIEF_VOICES.find((v) => v.id === voiceId);
  return voice ? `${voice.name}, ${voice.desc.toLowerCase()}` : voiceId;
}

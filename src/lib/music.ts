/**
 * One music bed, ducked under speech. These beds are included with the workspace,
 * so the price is not shown. A licensed library can replace the ids later (OD-3).
 */

export const MUSIC_BEDS = [
  { id: "upbeat", label: "Upbeat", mood: "upbeat" },
  { id: "tense", label: "Tense", mood: "tense" },
  { id: "calm", label: "Calm", mood: "calm" },
  { id: "quirky", label: "Quirky", mood: "quirky" },
] as const;

export type MusicBedId = (typeof MUSIC_BEDS)[number]["id"];

export const MUSIC_PRICE_USD = 0;

export function musicBed(id: string | null | undefined) {
  return MUSIC_BEDS.find((b) => b.id === id) ?? null;
}

/** Duck speech: the bed sits under the voice. 0 is silent, 1 is as loud as the voice. */
export function clampMusicVolume(n: number): number {
  if (!Number.isFinite(n)) return 0.25;
  return Math.min(1, Math.max(0, Math.round(n * 100) / 100));
}

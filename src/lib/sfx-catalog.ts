/**
 * The sound effects a person can put on a beat. The ids are StickStage's library.
 * A text slam suggests a sting; the person can still pick none.
 */
import { sfxLibrary } from "stickstage/data";

export type SfxChoice = {
  id: string;
  label: string;
  durationMs: number;
  tags: string[];
};

export const SFX_CHOICES: SfxChoice[] = sfxLibrary.sounds.map((s) => ({
  id: s.id,
  label: s.id.replace(/-/g, " "),
  durationMs: s.durationMs,
  tags: s.tags,
}));

const SLAM_STING: { test: RegExp; id: string }[] = [
  { test: /scratch|record|wait|wrong/i, id: "record-scratch" },
  { test: /boom|no|stop/i, id: "boom" },
  { test: /sad|fail|loss/i, id: "sad-trombone" },
  { test: /win|yes|nice|great/i, id: "ding" },
  { test: /awkward|silence|cricket/i, id: "crickets" },
];

/** A sting that fits a slam's words, or whoosh when nothing more specific fits. */
export function stingForSlam(value: string): string {
  const known = new Set(SFX_CHOICES.map((s) => s.id));
  for (const rule of SLAM_STING) {
    if (rule.test.test(value) && known.has(rule.id)) return rule.id;
  }
  return known.has("whoosh") ? "whoosh" : SFX_CHOICES[0]?.id ?? "pop";
}

export function sfxLabel(id: string | null | undefined): string {
  if (!id) return "none";
  return SFX_CHOICES.find((s) => s.id === id)?.label ?? id;
}

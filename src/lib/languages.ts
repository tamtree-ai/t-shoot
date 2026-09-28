/**
 * Languages a translated short can be made in. The voice is chosen again per language;
 * this list is the one the person picks from.
 */

export const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "es", label: "Spanish" },
  { id: "hi", label: "Hindi" },
  { id: "pt", label: "Portuguese" },
  { id: "fr", label: "French" },
  { id: "de", label: "German" },
  { id: "ja", label: "Japanese" },
  { id: "ko", label: "Korean" },
] as const;

export type LanguageId = (typeof LANGUAGES)[number]["id"];

export function languageLabel(id: string): string {
  return LANGUAGES.find((l) => l.id === id)?.label ?? id.toUpperCase();
}

/** Badges for a family of linked shorts, original first. */
export function languageBadges(projects: { id: string; language: string; sourceProjectId: string | null }[], projectId: string): string[] {
  const self = projects.find((p) => p.id === projectId);
  if (!self) return [];
  const root = self.sourceProjectId ?? self.id;
  const family = projects.filter((p) => p.id === root || p.sourceProjectId === root);
  const codes = [family.find((p) => p.id === root)?.language ?? "en", ...family.filter((p) => p.id !== root).map((p) => p.language)];
  return [...new Set(codes.map((c) => c.toUpperCase()))];
}

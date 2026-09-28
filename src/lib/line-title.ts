/** The first few words of a spoken line, for a scene that would otherwise be "Scene 3". */
export function lineTitle(narration: string, fallback: string): string {
  const clean = narration.replace(/\s+/g, " ").trim();
  if (!clean) return fallback;
  const words = clean.split(" ");
  const head = words.slice(0, 6).join(" ");
  return words.length > 6 ? `${head}…` : head;
}

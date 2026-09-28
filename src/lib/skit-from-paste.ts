import type { Skit } from "@/lib/tamtree/stage-flows";

import type { PastedBeat } from "./paste-script";

/**
 * A skit document from a paste. Speakers are already mapped onto catalog characters.
 * No writer, no spend.
 */
export function skitFromPaste(input: {
  title: string;
  beats: PastedBeat[];
  /** Speaker label → catalog character id. Unmapped speakers use the first character. */
  mapping: Record<string, string>;
  setId: string;
  fallbackCharacter: string;
}): Skit {
  const used: string[] = [];
  for (const beat of input.beats) {
    const character = (beat.speaker && input.mapping[beat.speaker]) || input.fallbackCharacter;
    if (!used.includes(character)) used.push(character);
  }
  if (used.length === 0) used.push(input.fallbackCharacter);
  const cast = used.map((character, i) => ({
    id: character,
    character,
    mark: i % 2 === 0 ? "left" : "right",
  }));
  return {
    schemaVersion: 1,
    meta: { title: input.title.slice(0, 80) || "Pasted script", description: "", hashtags: [] },
    set: input.setId,
    cast,
    beats: input.beats.map((beat, i) => {
      const character = (beat.speaker && input.mapping[beat.speaker]) || used[0]!;
      return {
        id: `b${i + 1}`,
        speaker: character,
        line: beat.line,
        expression: "neutral",
      };
    }),
  } as Skit;
}

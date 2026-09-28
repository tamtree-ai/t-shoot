/**
 * Which ideas to write this week. Nothing here voices or films.
 * The cap is a count of scripts, priced before the switch is turned on.
 */

export type DraftIdea = { id: string; body: string };

export type DraftAheadInput = {
  /** Ideas still waiting, in the person's order. */
  ideas: DraftIdea[];
  /** Scripts already written for this show in the current week. */
  draftedThisWeek: number;
  /** The show's weekly script cap. */
  weeklyCap: number;
};

export function ideasToDraft(input: DraftAheadInput): DraftIdea[] {
  const room = Math.max(0, input.weeklyCap - input.draftedThisWeek);
  return input.ideas.slice(0, room);
}

/** Monday 00:00 UTC of the week containing `now`. */
export function weekStart(now: Date): Date {
  const day = now.getUTCDay();
  const mondayOffset = day === 0 ? 6 : day - 1;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - mondayOffset));
}

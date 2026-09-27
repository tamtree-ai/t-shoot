/**
 * Scoring for the stick-script evaluation (writer-contract plan, batch 4).
 * Pure: the script that spends money imports this and does not live here.
 */
export type ScenePlan = {
  scenes: number;
  /** One set id per scene. A scene with no set is `undefined`. */
  sets: (string | undefined)[];
};

type SkitLike = Record<string, unknown>;

function setOf(scene: unknown): string | undefined {
  if (!scene || typeof scene !== "object" || !("set" in scene)) return undefined;
  const set = (scene as { set: unknown }).set;
  return typeof set === "string" ? set : undefined;
}

/** How many scenes a staged skit actually has, and which set each one is on. */
export function scenePlanOf(skit: SkitLike): ScenePlan {
  if (Array.isArray(skit.scenes) && skit.scenes.length > 0) {
    return { scenes: skit.scenes.length, sets: skit.scenes.map(setOf) };
  }
  return { scenes: 1, sets: [typeof skit.set === "string" ? skit.set : undefined] };
}

export type DraftPlanBrief = {
  scenes?: number;
  sets?: string[];
  set?: string;
};

/**
 * A draft kept the brief's scene plan: the scene count, and any sets the brief named
 * (a prefix; scenes past that list are the writer's to place).
 */
export function draftKeepsPlan(brief: DraftPlanBrief, skit: SkitLike): boolean {
  const plan = scenePlanOf(skit);
  if (plan.scenes !== (brief.scenes ?? 1)) return false;
  if (brief.sets) return brief.sets.every((set, i) => plan.sets[i] === set);
  if (brief.set) return plan.sets[0] === brief.set;
  return true;
}

/** A change kept the staging it was given: same scene count, same set on each scene. */
export function reviseKeepsPlan(before: SkitLike, after: SkitLike): boolean {
  const a = scenePlanOf(before);
  const b = scenePlanOf(after);
  return a.scenes === b.scenes && a.sets.every((set, i) => set === b.sets[i]);
}

import "server-only";

import { db, schema } from "@/db";
import { clipsFromPaste, parsePastedScript } from "@/lib/paste-script";
import { skitFromPaste } from "@/lib/skit-from-paste";
import type { StickBrief } from "@/lib/tamtree/stage-flows";
import { timelineDigest } from "@/lib/timeline";
import { aiClips } from "@/types/ai-clips";
import { stickSkit } from "@/types/stick-skit";
import { judgeSkit } from "@/types/stick-skit/draft";
import { createStickSkitProject } from "./projects";
import { getTypeDefaults } from "./type-settings";

export async function createStickFromPaste(
  memberId: string,
  orgId: string,
  input: {
    script: string;
    mapping: Record<string, string>;
    setId: string;
    limitUsd: string;
    showId?: string;
    episodeNumber?: number;
  },
): Promise<string> {
  const parsed = parsePastedScript(input.script);
  if (parsed.beats.length === 0) throw new Error("Paste a script with at least one line.");
  const defaults = await getTypeDefaults(orgId, stickSkit.kind);
  const fallback = defaults.allowed_characters[0];
  if (!fallback) throw new Error("Allow a character in Settings first.");
  if (!defaults.allowed_sets.includes(input.setId)) throw new Error("That set isn't available in this workspace.");
  for (const character of Object.values(input.mapping)) {
    if (!defaults.allowed_characters.includes(character)) throw new Error(`${character} isn't available in this workspace.`);
  }
  const title = parsed.beats[0]!.line.slice(0, 80);
  const castIds = [...new Set(parsed.beats.map((b) => (b.speaker && input.mapping[b.speaker]) || fallback))];
  const brief: StickBrief & { limitUsd: string } = {
    topic: title,
    cast: castIds.slice(0, 2).map((character) => ({ id: character, character })),
    set: input.setId,
    limitUsd: input.limitUsd,
  };
  const projectId = await createStickSkitProject(memberId, orgId, brief, {
    showId: input.showId,
    episodeNumber: input.episodeNumber,
    origin: "paste",
  });
  const skit = skitFromPaste({
    title,
    beats: parsed.beats,
    mapping: input.mapping,
    setId: input.setId,
    fallbackCharacter: fallback,
  });
  const verdict = judgeSkit(skit);
  await db.insert(schema.skitDrafts).values({
    projectId,
    skit,
    lines: verdict.lines,
    check: verdict.check,
    warnings: verdict.warnings,
    estimatedDurationS: verdict.estimatedDurationS,
    catalogVersion: stickSkit.catalogVersion(),
    digest: timelineDigest(skit),
    source: "edited",
  });
  return projectId;
}

export async function createClipsFromPaste(memberId: string, orgId: string, script: string, limitUsd: string): Promise<string> {
  const scenes = clipsFromPaste(script);
  if (scenes.length === 0) throw new Error("Paste a script with at least one line.");
  const defaults = await getTypeDefaults(orgId, aiClips.kind);
  const brief = {
    topic: scenes[0]!.narration.slice(0, 120),
    length_s: (defaults.max_length_s >= 45 ? 45 : defaults.max_length_s) as 30 | 45 | 60,
    tone: "curious",
    look: defaults.default_look,
    voice: defaults.default_voice,
  };
  const [project] = await db
    .insert(schema.projects)
    .values({
      orgId,
      title: brief.topic,
      kind: aiClips.kind,
      catalogVersion: aiClips.catalogVersion(),
      step: "script",
      brief,
      limitUsd,
      origin: "paste",
      createdBy: memberId,
      lastTouchedBy: memberId,
    })
    .returning();
  if (!project) throw new Error("The project was not created.");
  await db.insert(schema.scenes).values(
    scenes.map((scene, i) => ({
      projectId: project.id,
      position: i + 1,
      title: `Scene ${i + 1}`,
      narration: scene.narration,
      visualPrompt: scene.visual_prompt,
    })),
  );
  return project.id;
}

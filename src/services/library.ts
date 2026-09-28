import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { displayTitle } from "@/lib/display-title";
import type { StickBrief } from "@/lib/tamtree/stage-flows";
import { BRIEF_LOOKS } from "@/types/ai-clips/catalog";
import { aiClips } from "@/types/ai-clips";
import { stickSkit } from "@/types/stick-skit";
import { versionMedia } from "@/types/versions";
import { PLATFORM_LABEL, type Platform } from "@/types/social/post";
import { getProject } from "./projects";

export type LibraryThumb =
  | { kind: "stick"; setId: string; characters: string[] }
  | { kind: "clips"; gradient: string; assetId: string | null }
  | { kind: "none" };

export type LibraryPost = { platform: Platform; label: string };

export type LibraryRow = {
  id: string;
  title: string;
  kind: string;
  kindLabel: string;
  step: string;
  href: string;
  ago: string;
  updatedAt: string;
  archived: boolean;
  needsYou: number;
  lines: string;
  episodeNumber: number | null;
  showId: string | null;
  thumb: LibraryThumb;
  posts: LibraryPost[];
  readyToPost: boolean;
};

async function owned(orgId: string, projectId: string) {
  const project = await getProject(projectId);
  if (!project || project.orgId !== orgId) throw new Error("That project is not in this workspace.");
  return project;
}

export async function renameProject(orgId: string, projectId: string, title: string): Promise<void> {
  await owned(orgId, projectId);
  const name = title.trim().replace(/\s+/g, " ").slice(0, 120);
  if (!name) throw new Error("A project needs a name.");
  await db.update(schema.projects).set({ title: name, updatedAt: new Date() }).where(eq(schema.projects.id, projectId));
}

export async function archiveProject(orgId: string, projectId: string, archived: boolean): Promise<void> {
  await owned(orgId, projectId);
  await db
    .update(schema.projects)
    .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
    .where(eq(schema.projects.id, projectId));
}

/** Opening a project puts it back on the default list. */
export async function unarchiveOnOpen(orgId: string, projectId: string): Promise<void> {
  await db
    .update(schema.projects)
    .set({ archivedAt: null })
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.orgId, orgId)));
}

export async function deleteProject(orgId: string, projectId: string): Promise<void> {
  await owned(orgId, projectId);
  await db.delete(schema.projects).where(eq(schema.projects.id, projectId));
}

/** A new unapproved project with the same brief and the current script. No film, no spend. */
export async function duplicateProject(orgId: string, memberId: string, projectId: string): Promise<string> {
  const project = await owned(orgId, projectId);
  const [copy] = await db
    .insert(schema.projects)
    .values({
      orgId,
      title: project.title,
      kind: project.kind,
      catalogVersion: project.catalogVersion,
      step: "script",
      brief: project.brief,
      limitUsd: project.limitUsd,
      showId: project.showId,
      createdBy: memberId,
    })
    .returning();
  if (!copy) throw new Error("The copy was not created.");

  if (project.kind === "stick_skit") {
    const [draft] = await db.select().from(schema.skitDrafts).where(eq(schema.skitDrafts.projectId, project.id));
    if (draft) {
      await db.insert(schema.skitDrafts).values({
        projectId: copy.id,
        skit: draft.skit,
        premise: draft.premise,
        lines: draft.lines,
        check: draft.check,
        warnings: draft.warnings,
        estimatedDurationS: draft.estimatedDurationS,
        catalogVersion: draft.catalogVersion,
        digest: draft.digest,
        source: "edited",
      });
    }
  } else {
    const scenes = await db
      .select()
      .from(schema.scenes)
      .where(and(eq(schema.scenes.projectId, project.id), isNull(schema.scenes.droppedAt)));
    if (scenes.length) {
      await db.insert(schema.scenes).values(
        scenes.map((s) => ({
          projectId: copy.id,
          position: s.position,
          title: s.title,
          narration: s.narration,
          visualPrompt: s.visualPrompt,
        })),
      );
    }
  }
  return copy.id;
}

function stickThumb(brief: Record<string, unknown>): LibraryThumb {
  const parsed = brief as Partial<StickBrief>;
  const setId = parsed.set ?? parsed.sets?.[0] ?? "plain-1";
  const characters = (parsed.cast ?? []).map((c) => c.character).filter(Boolean);
  return { kind: "stick", setId, characters };
}

function clipsThumb(brief: Record<string, unknown>, assetId: string | null): LibraryThumb {
  const look = BRIEF_LOOKS.find((l) => l.id === brief.look);
  return { kind: "clips", gradient: look?.gradient ?? "linear-gradient(160deg, #2A2A30, #141417)", assetId };
}

function postLabel(platform: Platform, status: string, delivery: string | null): string {
  const name = PLATFORM_LABEL[platform];
  if (delivery === "live") return platform === "tiktok" ? `${name} draft` : name;
  if (delivery === "failed") return `${name} failed`;
  if (status === "confirmed") return `${name} ready`;
  return `${name} draft`;
}

export async function listLibrary(orgId: string, stepLabel: (step: string, steps: readonly string[]) => string): Promise<LibraryRow[]> {
  const projects = await db.select().from(schema.projects).where(eq(schema.projects.orgId, orgId)).orderBy(desc(schema.projects.updatedAt));
  const ids = new Set(projects.map((p) => p.id));

  const drafts = await db.select({ projectId: schema.skitDrafts.projectId, lines: schema.skitDrafts.lines, skit: schema.skitDrafts.skit }).from(schema.skitDrafts);
  const scenes = await db
    .select({ projectId: schema.scenes.projectId, narration: schema.scenes.narration })
    .from(schema.scenes)
    .where(isNull(schema.scenes.droppedAt));
  const versions = await db.select().from(schema.projectVersions).orderBy(desc(schema.projectVersions.number));
  const comments = await db.select().from(schema.comments);
  const posts = await db.select().from(schema.publications);

  const linesOf = new Map<string, string>();
  for (const d of drafts) {
    if (!ids.has(d.projectId)) continue;
    const fromLines = d.lines.map((l) => (typeof l.text === "string" ? l.text : "")).join(" ");
    const beats = JSON.stringify(d.skit);
    linesOf.set(d.projectId, `${fromLines} ${beats}`);
  }
  for (const s of scenes) {
    if (!ids.has(s.projectId)) continue;
    linesOf.set(s.projectId, `${linesOf.get(s.projectId) ?? ""} ${s.narration}`);
  }

  const latestAsset = new Map<string, string | null>();
  for (const v of versions) {
    if (latestAsset.has(v.projectId) || !ids.has(v.projectId)) continue;
    const media = versionMedia(v);
    latestAsset.set(v.projectId, media.kind === "video" ? media.mp4AssetId : v.renderAssetId);
  }

  const versionProject = new Map(versions.map((v) => [v.id, v.projectId]));
  const needs = new Map<string, number>();
  for (const c of comments) {
    if (c.resolvedByChangeRequestId || c.dismissedAt) continue;
    const projectId = versionProject.get(c.versionId);
    if (!projectId || !ids.has(projectId)) continue;
    needs.set(projectId, (needs.get(projectId) ?? 0) + 1);
  }

  const postsOf = new Map<string, LibraryPost[]>();
  const ready = new Set<string>();
  for (const p of posts) {
    if (!ids.has(p.projectId)) continue;
    const list = postsOf.get(p.projectId) ?? [];
    if (!list.some((x) => x.platform === p.platform)) {
      list.push({ platform: p.platform, label: postLabel(p.platform, p.status, p.delivery) });
      postsOf.set(p.projectId, list);
    }
    if (p.status === "confirmed" && p.delivery !== "live") ready.add(p.projectId);
  }

  return projects.map((p) => {
    const type = p.kind === "stick_skit" ? stickSkit : null;
    const steps = type ? type.steps : (["brief", "script", "edit", "review", "export"] as const);
    const step = p.step !== "brief" && (steps as readonly string[]).includes(p.step) ? p.step : "script";
    return {
      id: p.id,
      title: displayTitle(p.title),
      kind: p.kind,
      kindLabel: type?.label ?? aiClips.label,
      step: stepLabel(step, steps),
      href: `/p/${p.id}/${step}`,
      ago: "",
      updatedAt: p.updatedAt.toISOString(),
      archived: !!p.archivedAt,
      needsYou: needs.get(p.id) ?? 0,
      lines: linesOf.get(p.id) ?? "",
      episodeNumber: p.episodeNumber,
      showId: p.showId,
      thumb: p.kind === "stick_skit" ? stickThumb(p.brief) : clipsThumb(p.brief, latestAsset.get(p.id) ?? null),
      posts: postsOf.get(p.id) ?? [],
      readyToPost: ready.has(p.id),
    };
  });
}

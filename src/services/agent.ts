import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import type { CurrentMember } from "@/lib/auth";
import { hashToken, newToken, utcDay } from "@/lib/session-token";
import { humanToolLink, tokenSpendAllowed } from "@/lib/token-cap";
import { STICK_SCRIPT_PRICE_USD } from "@/lib/estimate";
import type { StickBrief } from "@/lib/tamtree/stage-flows";
import { PostDraft } from "@/types/social/post";
import { listShows } from "./shows";
import { createStickSkitProject, getProject } from "./projects";
import { getSkitDraft, reviseSkit, writeSkit } from "./skit";

export type AgentCaller = CurrentMember & { tokenId: string; dailyCapUsd: string };

export async function memberFromApiToken(header: string | null): Promise<AgentCaller | null> {
  if (!header?.startsWith("Bearer ")) return null;
  const raw = header.slice("Bearer ".length).trim();
  if (!raw) return null;
  const [token] = await db
    .select()
    .from(schema.apiTokens)
    .where(and(eq(schema.apiTokens.tokenHash, hashToken(raw)), isNull(schema.apiTokens.revokedAt)))
    .limit(1);
  if (!token) return null;
  const [member] = await db.select().from(schema.members).where(eq(schema.members.id, token.memberId)).limit(1);
  if (!member || member.role === "client") return null;
  return {
    memberId: member.id,
    orgId: member.orgId,
    name: member.name,
    email: member.email,
    role: member.role,
    tokenId: token.id,
    dailyCapUsd: token.dailyCapUsd,
  };
}

async function chargeToken(caller: AgentCaller, costUsd: string): Promise<void> {
  const [token] = await db.select().from(schema.apiTokens).where(eq(schema.apiTokens.id, caller.tokenId)).limit(1);
  if (!token) throw new Error("That assistant token is no longer active.");
  const today = utcDay();
  const decision = tokenSpendAllowed({
    spentUsd: token.spentUsd,
    spentOn: token.spentOn,
    today,
    capUsd: token.dailyCapUsd,
    costUsd,
  });
  if (!decision.ok) throw new Error(decision.reason);
  await db.update(schema.apiTokens).set({ spentUsd: decision.nextSpentUsd, spentOn: today }).where(eq(schema.apiTokens.id, token.id));
}

export async function agentListShows(caller: AgentCaller) {
  const shows = await listShows(caller.orgId);
  return shows.map((s) => ({ id: s.id, name: s.name }));
}

export async function agentCreateBrief(caller: AgentCaller, input: StickBrief & { limitUsd: string; showId?: string }): Promise<{ id: string; href: string }> {
  const { showId, ...brief } = input;
  const id = await createStickSkitProject(caller.memberId, caller.orgId, brief, { showId, origin: "assistant" });
  return { id, href: `/p/${id}/script` };
}

export async function agentWriteScript(caller: AgentCaller, projectId: string): Promise<{ href: string }> {
  const project = await getProject(projectId);
  if (!project || project.orgId !== caller.orgId) throw new Error("That project is not in this workspace.");
  await writeSkit(projectId, caller.memberId);
  await chargeToken(caller, STICK_SCRIPT_PRICE_USD.toFixed(6));
  return { href: `/p/${projectId}/script` };
}

export async function agentGetProject(caller: AgentCaller, projectId: string) {
  const project = await getProject(projectId);
  if (!project || project.orgId !== caller.orgId) throw new Error("That project is not in this workspace.");
  const draft = project.kind === "stick_skit" ? await getSkitDraft(projectId) : null;
  return {
    id: project.id,
    title: project.title,
    step: project.step,
    language: project.language,
    origin: project.origin,
    href: `/p/${project.id}/${project.step === "brief" ? "script" : project.step}`,
    hasScript: Boolean(draft),
  };
}

export async function agentRequestChange(caller: AgentCaller, projectId: string, note: string): Promise<{ href: string }> {
  const project = await getProject(projectId);
  if (!project || project.orgId !== caller.orgId) throw new Error("That project is not in this workspace.");
  await reviseSkit(projectId, note, caller.memberId);
  await chargeToken(caller, STICK_SCRIPT_PRICE_USD.toFixed(6));
  return { href: `/p/${projectId}/script` };
}

export async function agentPreparePost(caller: AgentCaller, projectId: string, title: string): Promise<{ href: string }> {
  const project = await getProject(projectId);
  if (!project || project.orgId !== caller.orgId) throw new Error("That project is not in this workspace.");
  const [version] = await db.select().from(schema.projectVersions).where(eq(schema.projectVersions.projectId, projectId)).limit(1);
  if (!version) throw new Error("Make the video before preparing a post.");
  const payload = PostDraft.parse({
    title: title.slice(0, 100),
    description: title.slice(0, 5000),
    hashtags: "",
    tags: "",
    privacy: "private",
    aiGenerated: true,
    categoryId: "23",
    scheduledAt: null,
  });
  await db.insert(schema.publications).values({
    projectId,
    versionId: version.id,
    platform: "youtube",
    status: "draft",
    payload,
  });
  return { href: `/p/${projectId}/export` };
}

export async function mintApiToken(member: CurrentMember, name: string, dailyCapUsd: string): Promise<{ token: string; config: string }> {
  if (member.role === "client") throw new Error("Clients can't connect an assistant.");
  const label = name.trim().slice(0, 40);
  if (!label) throw new Error("Name the token.");
  if (!(Number(dailyCapUsd) > 0)) throw new Error("Set a daily cap.");
  const token = `tshoot_${newToken()}`;
  await db.insert(schema.apiTokens).values({
    orgId: member.orgId,
    memberId: member.memberId,
    name: label,
    tokenHash: hashToken(token),
    tokenHint: token.slice(-4),
    dailyCapUsd: Number(dailyCapUsd).toFixed(6),
  });
  const config = JSON.stringify(
    {
      mcpServers: {
        "t-shoot": {
          command: "pnpm",
          args: ["mcp"],
          env: { TSHOOT_API_TOKEN: token, TSHOOT_BASE_URL: "http://localhost:3000" },
        },
      },
    },
    null,
    2,
  );
  return { token, config };
}

export async function listApiTokens(orgId: string) {
  return db
    .select({ id: schema.apiTokens.id, name: schema.apiTokens.name, tokenHint: schema.apiTokens.tokenHint, revokedAt: schema.apiTokens.revokedAt })
    .from(schema.apiTokens)
    .where(eq(schema.apiTokens.orgId, orgId));
}

export function agentRefuse(tool: string, projectId: string): { error: string; href: string } | null {
  const href = humanToolLink(tool, projectId);
  if (!href) return null;
  return { error: "A person has to do this in t-shoot.", href };
}

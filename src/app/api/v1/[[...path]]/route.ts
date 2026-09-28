import { NextResponse } from "next/server";

import { agentCreateBrief, agentGetProject, agentListShows, agentPreparePost, agentRefuse, agentRequestChange, agentWriteScript, memberFromApiToken } from "@/services/agent";
import { StickBrief } from "@/lib/tamtree/stage-flows";

async function caller(request: Request) {
  const member = await memberFromApiToken(request.headers.get("authorization"));
  if (!member) return null;
  return member;
}

function denied() {
  return NextResponse.json({ error: "Sign in with an assistant token." }, { status: 401 });
}

export async function GET(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const member = await caller(request);
  if (!member) return denied();
  const path = (await context.params).path ?? [];
  try {
    if (path.length === 1 && path[0] === "shows") return NextResponse.json({ shows: await agentListShows(member) });
    if (path[0] === "projects" && path[2] === undefined && path[1]) return NextResponse.json(await agentGetProject(member, path[1]));
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Something went wrong." }, { status: 400 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const member = await caller(request);
  if (!member) return denied();
  const path = (await context.params).path ?? [];
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    if (path.length === 1 && path[0] === "briefs") {
      const brief = StickBrief.parse({ topic: body.topic, ...(typeof body.showId === "string" ? {} : {}), cast: body.cast ?? [{ id: "milo", character: "milo" }] });
      const limitUsd = typeof body.limitUsd === "string" ? body.limitUsd : "1.00";
      return NextResponse.json(await agentCreateBrief(member, { ...brief, limitUsd, ...(typeof body.showId === "string" ? { showId: body.showId } : {}) }));
    }
    const projectId = path[1] ?? "";
    if (path[0] === "projects" && path[2] === "approve") {
      return NextResponse.json(agentRefuse("approve", projectId), { status: 403 });
    }
    if (path[0] === "projects" && path[2] === "send") {
      return NextResponse.json(agentRefuse("send_post", projectId), { status: 403 });
    }
    if (path[0] === "projects" && path[2] === "script") return NextResponse.json(await agentWriteScript(member, projectId));
    if (path[0] === "projects" && path[2] === "changes") {
      return NextResponse.json(await agentRequestChange(member, projectId, String(body.note ?? "")));
    }
    if (path[0] === "projects" && path[2] === "post") {
      return NextResponse.json(await agentPreparePost(member, projectId, String(body.title ?? "")));
    }
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Something went wrong." }, { status: 400 });
  }
}

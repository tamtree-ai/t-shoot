import { revalidatePath } from "next/cache";

import { getCurrentMember } from "@/lib/auth";
import { StudioError } from "@/lib/studio/errors";
import { LOGO_MAX_BYTES, removeLogo, saveLogo } from "@/services/studio/brand";

async function owner() {
  try {
    const m = await getCurrentMember();
    return m.role === "owner" ? m : null;
  } catch {
    return null;
  }
}

/** Raw image body (4 MB at most): `POST /api/studio/brand/logo?name=logo.png`. */
export async function POST(req: Request) {
  const m = await owner();
  if (!m) return Response.json({ ok: false, error: "Only the owner can change the brand." }, { status: 403 });
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > LOGO_MAX_BYTES) return Response.json({ ok: false, error: "The logo is over 4 MB. Export a smaller one." }, { status: 400 });
  try {
    const bytes = Buffer.from(await req.arrayBuffer());
    const fileId = await saveLogo(m.orgId, new URL(req.url).searchParams.get("name") ?? "logo", bytes);
    revalidatePath("/settings/brand");
    return Response.json({ ok: true, data: { fileId } });
  } catch (e) {
    if (e instanceof StudioError) return Response.json({ ok: false, error: e.message }, { status: 400 });
    console.error("[studio logo]", e);
    return Response.json({ ok: false, error: "The logo upload failed. Try again." }, { status: 500 });
  }
}

export async function DELETE() {
  const m = await owner();
  if (!m) return Response.json({ ok: false, error: "Only the owner can change the brand." }, { status: 403 });
  await removeLogo(m.orgId);
  revalidatePath("/settings/brand");
  return Response.json({ ok: true });
}

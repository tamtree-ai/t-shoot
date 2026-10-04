import { getCurrentMember } from "@/lib/auth";
import { UploadError, uploadVersion } from "@/services/studio/files";

/**
 * Owner upload: the raw file as the request body, streamed straight to the blob store (never
 * buffered), so a 2 GB video costs no memory.
 *
 *   POST /api/studio/uploads?variation=<id>&name=<file name>&note=<what changed>
 *   content-type: the file's type
 */
export async function POST(req: Request) {
  let member;
  try {
    member = await getCurrentMember();
  } catch {
    return Response.json({ ok: false, error: "Sign in first." }, { status: 401 });
  }
  if (member.role === "client") return Response.json({ ok: false, error: "Only the studio can upload." }, { status: 403 });

  const q = new URL(req.url).searchParams;
  const variationId = q.get("variation") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(variationId)) return Response.json({ ok: false, error: "Pick a variation to upload to." }, { status: 400 });
  if (!req.body) return Response.json({ ok: false, error: "No file was sent." }, { status: 400 });
  const declared = Number(req.headers.get("content-length"));

  try {
    const data = await uploadVersion({
      orgId: member.orgId,
      memberId: member.memberId,
      variationId,
      name: q.get("name")?.trim() || "upload",
      mime: req.headers.get("content-type") ?? "",
      changeNote: q.get("note") ?? "",
      body: req.body,
      declaredBytes: Number.isFinite(declared) && declared > 0 ? declared : null,
    });
    return Response.json({ ok: true, data });
  } catch (e) {
    if (e instanceof UploadError) return Response.json({ ok: false, error: e.message }, { status: 400 });
    console.error("[studio upload]", e);
    return Response.json({ ok: false, error: "The upload failed. Try again." }, { status: 500 });
  }
}

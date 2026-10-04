import { getCurrentMember } from "@/lib/auth";
import { getBlobStore } from "@/lib/blob";
import { getFile, type Rendition, renditionOf } from "@/services/studio/files";
import { blobResponse } from "@/services/studio/serve";

const RENDITIONS: Rendition[] = ["original", "preview", "poster", "thumb", "wm"];

/** The studio's own view of a file: `?r=preview|poster|thumb|wm|original` (default preview; `&download=1` for an attachment). Signed-in members of the file's org only. */
export async function GET(req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  let member;
  try {
    member = await getCurrentMember();
  } catch {
    return new Response("Sign in first.", { status: 401 });
  }
  const { fileId } = await params;
  const url = new URL(req.url);
  const r = (url.searchParams.get("r") ?? "preview") as Rendition;
  if (!RENDITIONS.includes(r) || !/^[0-9a-f-]{36}$/i.test(fileId)) return new Response("Not found.", { status: 404 });

  const file = await getFile(member.orgId, fileId);
  const rendition = file && renditionOf(file, r);
  if (!file || !rendition) return new Response("Not found.", { status: 404 });
  return blobResponse(req, getBlobStore(), rendition.key, {
    mime: rendition.mime,
    download: url.searchParams.get("download") === "1" ? file.originalName : undefined,
    headers: { "cache-control": "private, no-store", "x-robots-tag": "noindex" },
  });
}

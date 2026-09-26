import { getCurrentMember } from "@/lib/auth";
import { getTamtreeAdapter } from "@/lib/tamtree";
import { assetResponse, attachment } from "@/services/media";

/**
 * Media proxy stand-in (Track W3 builds the real one, with a Tamshoot object store).
 * Signed-in members only. On the mock, assets live in the *worker's* process; a stick
 * render's files are re-derived (`services/media.ts`), anything else is a placeholder.
 */
export async function GET(req: Request, { params }: { params: Promise<{ assetId: string }> }) {
  try {
    await getCurrentMember();
  } catch {
    return new Response("Sign in first.", { status: 401 });
  }
  const { assetId } = await params;
  const name = new URL(req.url).searchParams.get("name") ?? "short.mp4";
  const res = await assetResponse(req, assetId, name);
  if (res) return res;
  if (getTamtreeAdapter().kind !== "mock") return new Response("Not found.", { status: 404 });
  return new Response(`Placeholder for mock asset ${assetId}. The real file is served once Tamtree is connected.\n`, {
    headers: { "content-type": "text/plain", "content-disposition": attachment(`${name}.placeholder.txt`) },
  });
}

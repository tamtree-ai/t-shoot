import { getCurrentMember } from "@/lib/auth";
import { getTamtreeAdapter } from "@/lib/tamtree";

/**
 * Media proxy stand-in (Track W3 builds the real one, with a Tamshoot object store).
 * Signed-in members only. On the mock, assets live in the *worker's* process, so this
 * process cannot read them — it answers with a small placeholder file instead.
 */
export async function GET(req: Request, { params }: { params: Promise<{ assetId: string }> }) {
  try {
    await getCurrentMember();
  } catch {
    return new Response("Sign in first.", { status: 401 });
  }
  const { assetId } = await params;
  const name = new URL(req.url).searchParams.get("name") ?? "short.mp4";
  const adapter = getTamtreeAdapter();
  try {
    const asset = await adapter.getAssetContent(assetId);
    return new Response(asset.body, { headers: { "content-type": asset.mimeType, "content-disposition": `attachment; filename="${name}"` } });
  } catch {
    if (adapter.kind !== "mock") return new Response("Not found.", { status: 404 });
    return new Response(`Placeholder for mock asset ${assetId}. The real file is served once Tamtree is connected.\n`, {
      headers: { "content-type": "text/plain", "content-disposition": `attachment; filename="${name}.placeholder.txt"` },
    });
  }
}

import { assetResponse } from "@/services/media";
import { reviewVideoAsset } from "@/services/review";

/** The rendered video behind a review link: the token is the only credential (03 §1.5). */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const assetId = await reviewVideoAsset(token);
  const res = assetId && (await assetResponse(req, assetId));
  return res || new Response("Not found.", { status: 404 });
}

import { getBlobStore } from "@/lib/blob";
import { findShareByToken } from "@/services/studio/access";
import { getBrand } from "@/services/studio/brand";
import { getFile, renditionOf } from "@/services/studio/files";
import { blobResponse } from "@/services/studio/serve";

/** The studio's logo for the gate and the room: public to anyone holding the link (the gate shows it before the passcode). */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = await findShareByToken(token);
  if (!share) return new Response("Not found.", { status: 404 });
  const brand = await getBrand(share.orgId);
  const file = brand.logoFileId ? await getFile(share.orgId, brand.logoFileId) : null;
  const rendition = file && renditionOf(file, "preview");
  if (!rendition) return new Response("Not found.", { status: 404 });
  return blobResponse(req, getBlobStore(), rendition.key, { mime: rendition.mime, headers: { "cache-control": "private, max-age=300", "x-robots-tag": "noindex" } });
}

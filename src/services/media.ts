/**
 * Serving an asset's bytes to the browser (a stand-in until Track W3's media proxy): byte
 * ranges, so a `<video>` can seek, and the mock's stick renders. On the mock, assets live in
 * the worker's process, which this one cannot read; a stick render is pure (the canned MP4,
 * and srt/txt/manifest derived from the input), so its files are re-derived here from the
 * version that recorded them.
 */
import "server-only";

import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { getTamtreeAdapter } from "@/lib/tamtree";
import { stickProduceFiles } from "@/lib/tamtree/mock/stick";
import type { StickVersionPayload } from "@/types/stick-skit";

type Bytes = { bytes: Uint8Array; mimeType: string };

/** A stick version's file, re-derived on the mock. Null if no stick version names the asset. */
async function mockStickAsset(assetId: string): Promise<Bytes | null> {
  const versions = await db.select({ payload: schema.projectVersions.payload }).from(schema.projectVersions).where(eq(schema.projectVersions.kind, "stick_skit"));
  for (const { payload } of versions) {
    const v = payload as unknown as StickVersionPayload;
    const which = (Object.keys(v.render ?? {}) as (keyof StickVersionPayload["render"])[]).find((k) => v.render[k] === assetId);
    if (!which) continue;
    const files = stickProduceFiles({ catalog_version: v.catalog_version, skit: v.skit, voices: v.voices });
    if (typeof files === "string") return null;
    const text = (t: string) => new TextEncoder().encode(t);
    switch (which) {
      case "mp4":
        return { bytes: files.mp4, mimeType: "video/mp4" };
      case "srt":
        return { bytes: text(files.srt), mimeType: "application/x-subrip" };
      case "txt":
        return { bytes: text(files.txt), mimeType: "text/plain; charset=utf-8" };
      case "manifest":
        return { bytes: text(files.manifest), mimeType: "application/json" };
    }
  }
  return null;
}

/**
 * `content-disposition` for a download. Headers are Latin-1, and a title can hold anything
 * (curly quotes, emoji), so the name goes as RFC 5987 UTF-8 with an ASCII fallback.
 */
export function attachment(name: string): string {
  const ascii = name.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "").trim() || "download";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** `bytes=START-[END]` → the range, or null for none or one this doesn't handle. */
function parseRange(header: string | null): { start: number; end?: number } | null {
  const m = header?.match(/^bytes=(\d+)-(\d*)$/);
  if (!m) return null;
  return { start: Number(m[1]), ...(m[2] ? { end: Number(m[2]) } : {}) };
}

/**
 * The asset as a response. `download` names the file and makes it an attachment; without it,
 * it plays inline. Null when there is no such asset.
 */
export async function assetResponse(req: Request, assetId: string, download?: string): Promise<Response | null> {
  const range = parseRange(req.headers.get("range"));
  const disposition: Record<string, string> = download ? { "content-disposition": attachment(download) } : {};
  const adapter = getTamtreeAdapter();
  try {
    const asset = await adapter.getAssetContent(assetId, range ?? undefined);
    const headers: Record<string, string> = { "content-type": asset.mimeType, "accept-ranges": "bytes", ...disposition };
    if (asset.range && asset.size !== null) headers["content-range"] = `bytes ${asset.range.start}-${asset.range.end}/${asset.size}`;
    return new Response(asset.body, { status: asset.range ? 206 : 200, headers });
  } catch {
    if (adapter.kind !== "mock") return null;
  }

  const file = await mockStickAsset(assetId);
  if (!file) return null;
  const size = file.bytes.byteLength;
  const headers: Record<string, string> = { "content-type": file.mimeType, "accept-ranges": "bytes", ...disposition };
  if (!range || range.start >= size) return new Response(new Blob([file.bytes as BlobPart]), { headers: { ...headers, "content-length": String(size) } });
  const end = Math.min(range.end ?? size - 1, size - 1);
  headers["content-range"] = `bytes ${range.start}-${end}/${size}`;
  headers["content-length"] = String(end - range.start + 1);
  return new Response(new Blob([file.bytes.slice(range.start, end + 1) as BlobPart]), { status: 206, headers });
}

/** Serves a blob as an HTTP response with byte ranges (so `<video>` can seek). Used by the owner file route now and the review room's later. */
import "server-only";

import { type BlobStore, BlobNotFound } from "@/lib/blob";
import { attachment, parseRange } from "@/lib/http-range";

export async function blobResponse(
  req: Request,
  store: BlobStore,
  key: string,
  opts: { mime: string; download?: string; headers?: Record<string, string> },
): Promise<Response> {
  const stat = await store.stat(key);
  if (!stat) return new Response("Not found.", { status: 404 });
  const headers: Record<string, string> = {
    "content-type": opts.mime,
    "accept-ranges": "bytes",
    "x-content-type-options": "nosniff",
    ...(opts.download ? { "content-disposition": attachment(opts.download) } : {}),
    ...opts.headers,
  };
  const range = parseRange(req.headers.get("range"), stat.size);
  if (range === "unsatisfiable") return new Response(null, { status: 416, headers: { ...headers, "content-range": `bytes */${stat.size}` } });
  const body = async (r?: { start: number; end: number }) => {
    const { Readable } = await import("node:stream");
    return Readable.toWeb((await store.get(key, r)) as import("node:stream").Readable) as unknown as ReadableStream<Uint8Array>;
  };
  try {
    if (!range) return new Response(await body(), { headers: { ...headers, "content-length": String(stat.size) } });
    return new Response(await body(range), {
      status: 206,
      headers: { ...headers, "content-range": `bytes ${range.start}-${range.end}/${stat.size}`, "content-length": String(range.end - range.start + 1) },
    });
  } catch (e) {
    if (e instanceof BlobNotFound) return new Response("Not found.", { status: 404 });
    throw e;
  }
}

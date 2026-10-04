/**
 * Studio Review files: an upload becomes a `studio_files` row plus a version, and the worker
 * (`worker/studio-process.ts`) fills in the previews. Every call takes the caller's `orgId`.
 */
import "server-only";

import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { db, schema } from "@/db";
import { BlobTooLarge, getBlobStore } from "@/lib/blob";
import { enqueueStudioProcess } from "@/lib/queue";

export const MAX_UPLOAD_BYTES = 2 * 1024 ** 3;

export type Rendition = "original" | "preview" | "poster" | "thumb" | "wm";

export class UploadError extends Error {}

export const originalKey = (orgId: string, fileId: string) => `${orgId}/${fileId}/original`;

type FileRow = typeof schema.studioFiles.$inferSelect;

/** The blob and content type for one rendition of a file; null while it has not been made (or does not exist for this kind). */
export function renditionOf(file: FileRow, r: Rendition): { key: string; mime: string } | null {
  const video = file.mime.startsWith("video/");
  switch (r) {
    case "original":
      return { key: file.originalKey, mime: file.mime };
    case "preview":
      return file.previewKey ? { key: file.previewKey, mime: video ? "video/mp4" : "image/webp" } : null;
    case "wm":
      return file.wmPreviewKey ? { key: file.wmPreviewKey, mime: video ? "video/mp4" : "image/webp" } : null;
    case "poster":
      return file.posterKey ? { key: file.posterKey, mime: "image/jpeg" } : null;
    case "thumb":
      return file.thumbKey ? { key: file.thumbKey, mime: "image/webp" } : null;
  }
}

export async function getFile(orgId: string, fileId: string): Promise<FileRow | null> {
  const [row] = await db.select().from(schema.studioFiles).where(and(eq(schema.studioFiles.id, fileId), eq(schema.studioFiles.orgId, orgId))).limit(1);
  return row ?? null;
}

/**
 * Streams `body` to the blob store and adds it to `variationId` as the next version. The variation
 * must belong to `orgId` and match the asset's kind (image or video). Nothing is buffered.
 */
export async function uploadVersion(input: {
  orgId: string;
  memberId: string;
  variationId: string;
  name: string;
  mime: string;
  changeNote: string;
  body: ReadableStream<Uint8Array>;
  declaredBytes?: number | null;
}): Promise<{ fileId: string; versionId: string; number: number }> {
  const [target] = await db
    .select({ kind: schema.studioAssets.kind })
    .from(schema.studioVariations)
    .innerJoin(schema.studioAssets, eq(schema.studioAssets.id, schema.studioVariations.assetId))
    .innerJoin(schema.studioProjects, eq(schema.studioProjects.id, schema.studioAssets.projectId))
    .where(and(eq(schema.studioVariations.id, input.variationId), eq(schema.studioProjects.orgId, input.orgId)))
    .limit(1);
  if (!target) throw new UploadError("That variation was not found.");
  const mime = input.mime.split(";")[0]!.trim().toLowerCase();
  if (!mime.startsWith(`${target.kind}/`)) throw new UploadError(`This asset takes ${target.kind === "image" ? "an image" : "a video"}, and that file is ${mime || "of an unknown type"}.`);
  if (input.declaredBytes != null && input.declaredBytes > MAX_UPLOAD_BYTES) throw new UploadError("That file is over the 2 GB limit.");

  const fileId = randomUUID();
  const key = originalKey(input.orgId, fileId);
  const store = getBlobStore();
  let put: { size: number; sha256: string };
  try {
    put = await store.put(key, input.body, { maxBytes: MAX_UPLOAD_BYTES });
  } catch (e) {
    if (e instanceof BlobTooLarge) throw new UploadError("That file is over the 2 GB limit.");
    throw e;
  }
  if (put.size === 0) {
    await store.delete(key);
    throw new UploadError("That file is empty.");
  }

  try {
    const created = await insertVersion(input, fileId, key, put);
    await enqueueStudioProcess(fileId);
    return { fileId, versionId: created.id, number: created.number };
  } catch (e) {
    await store.delete(key);
    throw e;
  }
}

/** The file row and the next version number, together. Two uploads to one variation at once pick the same number; the unique index rejects the second, which tries again. */
async function insertVersion(
  input: { orgId: string; memberId: string; variationId: string; name: string; mime: string; changeNote: string },
  fileId: string,
  key: string,
  put: { size: number; sha256: string },
) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        await tx.insert(schema.studioFiles).values({ id: fileId, orgId: input.orgId, originalKey: key, originalName: input.name.slice(0, 200), mime: input.mime.split(";")[0]!.trim().toLowerCase(), bytes: put.size, sha256: put.sha256 });
        const [next] = await tx
          .select({ n: sql<number>`coalesce(max(${schema.studioVersions.number}), 0) + 1` })
          .from(schema.studioVersions)
          .where(eq(schema.studioVersions.variationId, input.variationId));
        const [version] = await tx
          .insert(schema.studioVersions)
          .values({ variationId: input.variationId, number: next!.n, fileId, changeNote: input.changeNote.slice(0, 2000), createdBy: input.memberId })
          .returning({ id: schema.studioVersions.id, number: schema.studioVersions.number });
        return version!;
      });
    } catch (e) {
      const code = (e as { code?: string; cause?: { code?: string } }).code ?? (e as { cause?: { code?: string } }).cause?.code;
      if (code !== "23505" || attempt >= 4) throw e;
    }
  }
}

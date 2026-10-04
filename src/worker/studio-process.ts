/**
 * `studio.process`: turns an uploaded original into what the review room shows.
 *
 *   image → preview.webp (long edge 2560), thumb.webp (480), wm_preview.webp (watermarked)
 *   video → preview.mp4 (H.264, 1080p max, +faststart), poster.jpg, thumb.webp, wm_preview.mp4
 *
 * The original is never touched. A file ends `ready`, or `failed` with a plain-English reason the
 * owner reads (see `explain`).
 */
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
import sharp from "sharp";

import { db, schema } from "@/db";
import { getBlobStore, type BlobStore } from "@/lib/blob";
import { parseProbe, proxySize, type VideoInfo } from "@/lib/studio/video-plan";
import { watermarkSvg, watermarkText } from "@/lib/studio/watermark";

type FileRow = typeof schema.studioFiles.$inferSelect;
type Renditions = Partial<Pick<FileRow, "previewKey" | "thumbKey" | "posterKey" | "wmPreviewKey" | "width" | "height" | "durationS" | "fpsNum" | "fpsDen">>;

/** A message for the owner; anything else that goes wrong is logged and shown as a generic one. */
class Explained extends Error {}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err = (err + d).slice(-4000)));
    p.on("error", (e) => reject((e as NodeJS.ErrnoException).code === "ENOENT" ? new Explained(`${cmd} is not installed on the server, so videos can't be processed. Install ffmpeg and upload the file again.`) : e));
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err.trim().split("\n").slice(-3).join(" | ")}`))));
  });
}

/** ffmpeg and ffprobe on PATH? The worker calls this at start so a missing one is loud once, not a mystery per file. */
export async function checkFfmpeg(): Promise<string | null> {
  try {
    await run("ffmpeg", ["-version"]);
    await run("ffprobe", ["-version"]);
    return null;
  } catch (e) {
    return e instanceof Explained ? e.message : `ffmpeg check failed: ${(e as Error).message}`;
  }
}

async function putFile(store: BlobStore, key: string, file: string) {
  await store.put(key, createReadStream(file));
}

async function brandName(orgId: string): Promise<string | null> {
  const [b] = await db.select({ name: schema.studioBrand.studioName }).from(schema.studioBrand).where(eq(schema.studioBrand.orgId, orgId)).limit(1);
  return b?.name ?? null;
}

async function processImage(file: FileRow, src: string, tmp: string, store: BlobStore, base: string, text: string): Promise<Renditions> {
  let meta;
  try {
    meta = await sharp(src, { limitInputPixels: 400_000_000 }).metadata();
  } catch {
    throw new Explained("This image couldn't be read. Export it as a PNG or JPG and upload it again.");
  }
  // EXIF orientation 5–8 turns the picture on its side.
  const turned = (meta.orientation ?? 1) >= 5;
  const width = turned ? meta.height : meta.width;
  const height = turned ? meta.width : meta.height;
  if (!width || !height) throw new Explained("This image has no size. Export it as a PNG or JPG and upload it again.");

  const pipeline = () => sharp(src, { limitInputPixels: 400_000_000 }).rotate();
  const preview = await pipeline().resize({ width: 2560, height: 2560, fit: "inside", withoutEnlargement: true }).webp({ quality: 88 }).toBuffer({ resolveWithObject: true });
  const wmSvg = Buffer.from(watermarkSvg(preview.info.width, preview.info.height, text));
  const wm = await sharp(preview.data).composite([{ input: wmSvg }]).webp({ quality: 85 }).toBuffer();
  const thumb = await pipeline().resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();

  const out = { preview: `${base}/preview.webp`, wm: `${base}/wm_preview.webp`, thumb: `${base}/thumb.webp` };
  for (const [key, buf, name] of [[out.preview, preview.data, "p"], [out.wm, wm, "w"], [out.thumb, thumb, "t"]] as const) {
    const f = path.join(tmp, `${name}.webp`);
    await writeFile(f, buf);
    await putFile(store, key, f);
  }
  return { previewKey: out.preview, wmPreviewKey: out.wm, thumbKey: out.thumb, width, height };
}

async function processVideo(file: FileRow, src: string, tmp: string, store: BlobStore, base: string, text: string): Promise<Renditions> {
  let info: VideoInfo;
  try {
    info = parseProbe(JSON.parse(await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", src])));
  } catch (e) {
    if (e instanceof Explained) throw e;
    if ((e as Error).message.includes("no video")) throw new Explained((e as Error).message);
    throw new Explained("This video couldn't be read. Export it as an H.264 MP4 or MOV and upload it again.");
  }
  const size = proxySize(info.width, info.height);
  const scale = `scale=${size.width}:${size.height}`;
  const encode = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart"];
  const audio = info.hasAudio ? ["-map", "0:a:0"] : [];
  const proxy = path.join(tmp, "preview.mp4");
  await run("ffmpeg", ["-y", "-v", "error", "-i", src, "-map", "0:v:0", ...audio, "-vf", scale, ...encode, proxy]);

  // The watermark is burnt in from the original (not the proxy), so it costs one encode, not two.
  const overlay = path.join(tmp, "wm.png");
  await sharp(Buffer.from(watermarkSvg(size.width, size.height, text))).png().toFile(overlay);
  const wmOut = path.join(tmp, "wm_preview.mp4");
  await run("ffmpeg", ["-y", "-v", "error", "-i", src, "-i", overlay, "-filter_complex", `[0:v]${scale}[b];[b][1:v]overlay=0:0[v]`, "-map", "[v]", ...audio, ...encode, wmOut]);

  const posterFile = path.join(tmp, "poster.jpg");
  const at = info.durationS ? (info.durationS * 0.1).toFixed(3) : "0";
  await run("ffmpeg", ["-y", "-v", "error", "-ss", at, "-i", proxy, "-frames:v", "1", "-q:v", "3", posterFile]);
  const thumbFile = path.join(tmp, "thumb.webp");
  await sharp(posterFile).resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toFile(thumbFile);

  const keys = { previewKey: `${base}/preview.mp4`, wmPreviewKey: `${base}/wm_preview.mp4`, posterKey: `${base}/poster.jpg`, thumbKey: `${base}/thumb.webp` };
  await putFile(store, keys.previewKey, proxy);
  await putFile(store, keys.wmPreviewKey, wmOut);
  await putFile(store, keys.posterKey, posterFile);
  await putFile(store, keys.thumbKey, thumbFile);
  return { ...keys, width: info.width, height: info.height, durationS: info.durationS, fpsNum: info.fpsNum, fpsDen: info.fpsDen };
}

/**
 * Processes one file. Throws only for a failure worth retrying (a crash, a full disk); an unreadable
 * file is marked `failed` with the reason, and the job succeeds.
 */
export async function processStudioFile(fileId: string, store: BlobStore = getBlobStore()): Promise<void> {
  const [file] = await db.select().from(schema.studioFiles).where(eq(schema.studioFiles.id, fileId)).limit(1);
  if (!file || file.processing === "ready") return;

  const tmp = await mkdtemp(path.join(tmpdir(), "studio-"));
  try {
    const text = watermarkText(await brandName(file.orgId));
    const base = file.originalKey.replace(/\/original$/, "");
    // ffmpeg and sharp want a path: the local store has one; a remote store would download here first.
    const src = store.localPath(file.originalKey);
    if (!src) throw new Error("This blob store can't hand out a local path yet.");
    const made = file.mime.startsWith("video/") ? await processVideo(file, src, tmp, store, base, text) : await processImage(file, src, tmp, store, base, text);
    await db.update(schema.studioFiles).set({ ...made, processing: "ready", error: null }).where(eq(schema.studioFiles.id, fileId));
  } catch (e) {
    if (!(e instanceof Explained)) {
      console.error("[studio.process]", fileId, e);
      throw e;
    }
    await db.update(schema.studioFiles).set({ processing: "failed", error: e.message }).where(eq(schema.studioFiles.id, fileId));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/** A job that ran out of retries: say so instead of leaving the file "processing" forever. */
export async function failStudioFile(fileId: string): Promise<void> {
  await db
    .update(schema.studioFiles)
    .set({ processing: "failed", error: "Something went wrong while preparing this file. Upload it again, and if it keeps failing, check the worker log." })
    .where(eq(schema.studioFiles.id, fileId));
}

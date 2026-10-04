/** Upload → process → serve, against the dev DB, real sharp and real ffmpeg. Everything lives under a throwaway org and data dir. */
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/queue", () => ({ enqueueStudioProcess: vi.fn(async () => undefined) }));

let dataDir: string;
let orgId: string;
let memberId: string;
let imageVariation: string;
let videoVariation: string;
let otherOrgVariation: string;

type Mods = {
  db: typeof import("@/db");
  files: typeof import("@/services/studio/files");
  proc: typeof import("@/worker/studio-process");
  serve: typeof import("@/services/studio/serve");
  blob: typeof import("@/lib/blob");
};
let m: Mods;

const web = (b: Buffer) => new Blob([new Uint8Array(b)]).stream();

async function makeTree(org: string, kind: "image" | "video") {
  const { db, schema } = m.db;
  const [client] = await db.insert(schema.studioClients).values({ orgId: org, name: "Acme" }).returning();
  const [project] = await db.insert(schema.studioProjects).values({ orgId: org, clientId: client!.id, name: "Spring" }).returning();
  const [asset] = await db.insert(schema.studioAssets).values({ projectId: project!.id, title: "A", kind }).returning();
  const [variation] = await db.insert(schema.studioVariations).values({ assetId: asset!.id }).returning();
  return variation!.id;
}

beforeAll(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "studio-test-"));
  process.env.STUDIO_DATA_DIR = dataDir;
  process.env.DATABASE_URL ??= "postgres://tamshoot:tamshoot@localhost:5433/tamshoot";
  m = {
    db: await import("@/db"),
    files: await import("@/services/studio/files"),
    proc: await import("@/worker/studio-process"),
    serve: await import("@/services/studio/serve"),
    blob: await import("@/lib/blob"),
  };
  const { db, schema } = m.db;
  const [org] = await db.insert(schema.orgs).values({ name: "studio-test" }).returning();
  const [other] = await db.insert(schema.orgs).values({ name: "studio-test-other" }).returning();
  orgId = org!.id;
  const [member] = await db.insert(schema.members).values({ orgId, email: `studio-test-${Date.now()}@example.com`, role: "owner" }).returning();
  memberId = member!.id;
  await db.insert(schema.studioBrand).values({ orgId, studioName: "Test Studio" });
  imageVariation = await makeTree(orgId, "image");
  videoVariation = await makeTree(orgId, "video");
  otherOrgVariation = await makeTree(other!.id, "image");
});

afterAll(async () => {
  const { db, schema } = m.db;
  // Versions point at files without a cascade, so the tree goes first (clients → … → versions), then the org takes its files.
  for (const name of ["studio-test", "studio-test-other"]) {
    const orgs = await db.select({ id: schema.orgs.id }).from(schema.orgs).where(eq(schema.orgs.name, name));
    for (const { id } of orgs) await db.delete(schema.studioClients).where(eq(schema.studioClients.orgId, id));
    await db.delete(schema.orgs).where(eq(schema.orgs.name, name));
  }
  await rm(dataDir, { recursive: true, force: true });
});

const upload = (variationId: string, mime: string, body: Buffer, name = "f", declaredBytes?: number | null) =>
  m.files.uploadVersion({ orgId, memberId, variationId, name, mime, changeNote: "first", body: web(body), declaredBytes });

describe("image", () => {
  it("uploads as v1, then v2, and processes to a watermarked preview and a thumbnail", async () => {
    const png = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#3a7" } }).png().toBuffer();
    const v1 = await upload(imageVariation, "image/png", png, "banner.png");
    const v2 = await upload(imageVariation, "image/png", png, "banner2.png");
    expect([v1.number, v2.number]).toEqual([1, 2]);

    await m.proc.processStudioFile(v1.fileId);
    const file = (await m.files.getFile(orgId, v1.fileId))!;
    expect(file).toMatchObject({ processing: "ready", width: 3000, height: 2000, error: null });
    expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
    const store = m.blob.getBlobStore();
    const preview = await sharp(store.localPath(file.previewKey!)!).metadata();
    expect([preview.format, preview.width, preview.height]).toEqual(["webp", 2560, 1707]);
    expect((await sharp(store.localPath(file.thumbKey!)!).metadata()).width).toBe(480);
    // The watermark changes pixels; the clean preview does not match the watermarked one.
    const clean = await sharp(store.localPath(file.previewKey!)!).raw().toBuffer();
    const marked = await sharp(store.localPath(file.wmPreviewKey!)!).raw().toBuffer();
    expect(Buffer.compare(clean, marked)).not.toBe(0);
  });

  it("rejects a video for an image asset, an empty file, and another org's variation", async () => {
    await expect(upload(imageVariation, "video/mp4", Buffer.from("x"))).rejects.toThrow("takes an image");
    await expect(upload(imageVariation, "image/png", Buffer.alloc(0))).rejects.toThrow("empty");
    await expect(upload(otherOrgVariation, "image/png", Buffer.from("x"))).rejects.toThrow("not found");
    await expect(upload(imageVariation, "image/png", Buffer.from("x"), "f", 3 * 1024 ** 3)).rejects.toThrow("2 GB");
  });

  it("marks an unreadable image failed with a plain message, and the job still succeeds", async () => {
    const bad = await upload(imageVariation, "image/png", Buffer.from("not a picture"));
    await m.proc.processStudioFile(bad.fileId);
    const file = (await m.files.getFile(orgId, bad.fileId))!;
    expect(file.processing).toBe("failed");
    expect(file.error).toContain("couldn't be read");
  });
});

describe("video", () => {
  it("probes, makes a 1080p-max proxy, poster, thumb and a watermarked proxy", async () => {
    const out = path.join(dataDir, "src.mp4");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=1280x720:rate=30000/1001:duration=2", "-f", "lavfi", "-i", "sine=duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-y", out]);
    const { readFile } = await import("node:fs/promises");
    const v = await upload(videoVariation, "video/mp4", await readFile(out), "teaser.mp4");
    await m.proc.processStudioFile(v.fileId);
    const file = (await m.files.getFile(orgId, v.fileId))!;
    expect(file).toMatchObject({ processing: "ready", width: 1280, height: 720, fpsNum: 30000, fpsDen: 1001 });
    expect(file.durationS).toBeGreaterThan(1.5);
    const store = m.blob.getBlobStore();
    for (const key of [file.previewKey!, file.wmPreviewKey!]) {
      const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", store.localPath(key)!]).toString());
      expect(probe.streams.map((s: { codec_type: string }) => s.codec_type).sort()).toEqual(["audio", "video"]);
    }
    expect((await sharp(store.localPath(file.posterKey!)!).metadata()).format).toBe("jpeg");
    expect((await sharp(store.localPath(file.thumbKey!)!).metadata()).width).toBe(480);
  }, 60_000);

  it("fails a file that is not a video", async () => {
    const bad = await upload(videoVariation, "video/mp4", Buffer.from("definitely not a video"));
    await m.proc.processStudioFile(bad.fileId);
    expect((await m.files.getFile(orgId, bad.fileId))!.processing).toBe("failed");
  });
});

describe("serving", () => {
  it("answers whole, 206 for a range, 416 past the end, 404 for a missing key", async () => {
    const store = m.blob.getBlobStore();
    await store.put("t/ranges.bin", Readable.from([Buffer.from("0123456789")]));
    const get = (range?: string, key = "t/ranges.bin") =>
      m.serve.blobResponse(new Request("http://x/", { headers: range ? { range } : {} }), store, key, { mime: "application/octet-stream" });
    const whole = await get();
    expect([whole.status, await whole.text(), whole.headers.get("accept-ranges")]).toEqual([200, "0123456789", "bytes"]);
    const part = await get("bytes=2-4");
    expect([part.status, await part.text(), part.headers.get("content-range")]).toEqual([206, "234", "bytes 2-4/10"]);
    expect((await get("bytes=50-")).status).toBe(416);
    expect((await get(undefined, "t/missing")).status).toBe(404);
  });
});

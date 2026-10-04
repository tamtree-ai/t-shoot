import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LocalBlobStore } from "./local";
import { BlobNotFound, BlobTooLarge } from "./types";

let dir: string;
let store: LocalBlobStore;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "blob-"));
  store = new LocalBlobStore(dir);
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const text = async (s: NodeJS.ReadableStream) => {
  const parts: Buffer[] = [];
  for await (const c of s) parts.push(Buffer.from(c as Buffer));
  return Buffer.concat(parts).toString();
};

describe("LocalBlobStore", () => {
  it("puts a stream, reports its size and SHA-256, and reads it back", async () => {
    const r = await store.put("org/f/original.bin", Readable.from([Buffer.from("hello "), Buffer.from("world")]));
    expect(r).toEqual({ size: 11, sha256: createHash("sha256").update("hello world").digest("hex") });
    expect(await store.stat("org/f/original.bin")).toEqual({ size: 11 });
    expect(await text(await store.get("org/f/original.bin"))).toBe("hello world");
  });
  it("accepts a web stream", async () => {
    const r = await store.put("a.txt", new Blob(["abc"]).stream());
    expect(r.size).toBe(3);
  });
  it("reads an inclusive byte range", async () => {
    await store.put("a.txt", Readable.from([Buffer.from("0123456789")]));
    expect(await text(await store.get("a.txt", { start: 2, end: 5 }))).toBe("2345");
  });
  it("leaves no temp file when the stream fails, and keeps the old bytes", async () => {
    await store.put("a.txt", Readable.from([Buffer.from("old")]));
    const bad = new Readable({ read() { this.destroy(new Error("cut off")); } });
    await expect(store.put("a.txt", bad)).rejects.toThrow("cut off");
    expect(await text(await store.get("a.txt"))).toBe("old");
    expect(await readdir(dir)).toEqual(["a.txt"]);
  });
  it("stops at maxBytes and leaves nothing behind", async () => {
    await expect(store.put("big.bin", Readable.from([Buffer.alloc(10), Buffer.alloc(10)]), { maxBytes: 15 })).rejects.toBeInstanceOf(BlobTooLarge);
    expect(await readdir(dir)).toEqual([]);
  });
  it("throws BlobNotFound, and delete is idempotent", async () => {
    await expect(store.get("nope")).rejects.toBeInstanceOf(BlobNotFound);
    expect(await store.stat("nope")).toBeNull();
    await store.delete("nope");
  });
  it("refuses keys that escape the root", async () => {
    await expect(store.put("../evil", Readable.from(["x"]))).rejects.toThrow("outside");
    expect(() => store.localPath("a/../../evil")).toThrow("outside");
  });
});

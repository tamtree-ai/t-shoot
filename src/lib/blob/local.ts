/** BlobStore on the local disk under `STUDIO_DATA_DIR`. Writes go to a temp file, then rename, so a crash never leaves half a file at a key. */
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { BlobNotFound, BlobTooLarge, type BlobStat, type BlobStore } from "./types";

export class LocalBlobStore implements BlobStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  /** The key as a path under the root; anything that would escape it is refused. */
  private resolve(key: string): string {
    if (!key || key.includes("\0")) throw new Error(`Bad blob key ${JSON.stringify(key)}.`);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error(`Blob key ${key} is outside the store.`);
    return full;
  }

  localPath(key: string): string {
    return this.resolve(key);
  }

  async put(key: string, body: ReadableStream<Uint8Array> | NodeJS.ReadableStream, opts: { maxBytes?: number } = {}) {
    const dest = this.resolve(key);
    await mkdir(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.${randomUUID()}.tmp`;
    const hash = createHash("sha256");
    let size = 0;
    const { maxBytes } = opts;
    const counter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        size += chunk.length;
        if (maxBytes !== undefined && size > maxBytes) return cb(new BlobTooLarge(maxBytes));
        hash.update(chunk);
        cb(null, chunk);
      },
    });
    const source = "getReader" in body ? Readable.fromWeb(body as import("node:stream/web").ReadableStream<Uint8Array>) : (body as NodeJS.ReadableStream);
    try {
      await pipeline(source, counter, createWriteStream(tmp));
      await rename(tmp, dest);
    } catch (e) {
      await rm(tmp, { force: true });
      throw e;
    }
    return { size, sha256: hash.digest("hex") };
  }

  async get(key: string, range?: { start: number; end: number }) {
    const file = this.resolve(key);
    if (!(await this.stat(key))) throw new BlobNotFound(key);
    return createReadStream(file, range);
  }

  async stat(key: string): Promise<BlobStat | null> {
    try {
      const s = await stat(this.resolve(key));
      return s.isFile() ? { size: s.size } : null;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }
}

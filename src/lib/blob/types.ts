/**
 * Where Studio Review keeps bytes. v1 is the local disk (`local.ts`); an S3/R2 store is a later
 * drop-in behind the same four calls. Keys are `/`-separated, relative, and chosen by the caller.
 */

export type BlobStat = { size: number };

export interface BlobStore {
  /** Streams `body` to `key` (replacing it), never buffering it whole. Past `maxBytes` it stops, removes the partial file and throws `BlobTooLarge`. Returns the size and the hex SHA-256 of the bytes written. */
  put(key: string, body: ReadableStream<Uint8Array> | NodeJS.ReadableStream, opts?: { maxBytes?: number }): Promise<{ size: number; sha256: string }>;
  /** The bytes of `key`, or of the inclusive byte range. Throws `BlobNotFound` if it is not there. */
  get(key: string, range?: { start: number; end: number }): Promise<NodeJS.ReadableStream>;
  stat(key: string): Promise<BlobStat | null>;
  /** Removes `key`; fine if it is already gone. */
  delete(key: string): Promise<void>;
  /** A path on the local disk for tools that need one (ffmpeg, sharp). Stores that are not on disk return null. */
  localPath(key: string): string | null;
}

export class BlobNotFound extends Error {
  constructor(key: string) {
    super(`No blob at ${key}.`);
  }
}

export class BlobTooLarge extends Error {
  constructor(readonly maxBytes: number) {
    super(`The file is larger than ${maxBytes} bytes.`);
  }
}

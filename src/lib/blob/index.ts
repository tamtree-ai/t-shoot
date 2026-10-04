import path from "node:path";

import { studioEnv } from "@/lib/studio/env";

import { LocalBlobStore } from "./local";
import type { BlobStore } from "./types";

export * from "./types";

const g = globalThis as unknown as { __studioBlob?: BlobStore };

/** The configured store (`STUDIO_BLOB`, `STUDIO_DATA_DIR`), made once per process. */
export function getBlobStore(): BlobStore {
  g.__studioBlob ??= new LocalBlobStore(path.resolve(studioEnv().dataDir));
  return g.__studioBlob;
}

import "server-only";

import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import type { RunPatch, RunStore } from "./drive-run";

export const dbRunStore: RunStore = {
  async get(id) {
    const [row] = await db.select().from(schema.runs).where(eq(schema.runs.id, id));
    return row ?? null;
  },
  async patch(id, patch: RunPatch) {
    await db.update(schema.runs).set({ ...patch, updatedAt: new Date() }).where(eq(schema.runs.id, id));
  },
};

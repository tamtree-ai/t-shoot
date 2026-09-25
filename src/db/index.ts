import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

const globalForDb = globalThis as unknown as { __tamshootPool?: Pool };

function pool(): Pool {
  if (!globalForDb.__tamshootPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set (see .env.example).");
    globalForDb.__tamshootPool = new Pool({ connectionString: url });
  }
  return globalForDb.__tamshootPool;
}

export const db = drizzle({ client: pool(), schema });
export { schema };

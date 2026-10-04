import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { Client } from "pg";

/**
 * Signs the e2e browser in as the seeded owner: one session row, its cookie in a storage state.
 * Since Studio Review Phase 0 there is no owner fallback, so every spec starts signed in this way.
 */
export const OWNER_STATE = "e2e/.auth/owner.json";

export default async function globalSetup() {
  const db = new Client({ connectionString: process.env.DATABASE_URL ?? "postgres://tamshoot:tamshoot@localhost:5433/tamshoot" });
  await db.connect();
  try {
    const { rows } = await db.query<{ id: string }>("select id from members where role = 'owner' order by created_at limit 1");
    if (!rows[0]) throw new Error("No seeded owner. Run `pnpm db:seed` first.");
    const token = randomBytes(32).toString("base64url");
    const hash = createHash("sha256").update(token).digest("hex");
    await db.query("insert into sessions (member_id, token_hash, expires_at) values ($1, $2, now() + interval '1 day')", [rows[0].id, hash]);
    mkdirSync(dirname(OWNER_STATE), { recursive: true });
    const cookie = { name: "tshoot_session", value: token, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 86_400, httpOnly: true, secure: false, sameSite: "Lax" as const };
    writeFileSync(OWNER_STATE, JSON.stringify({ cookies: [cookie], origins: [] }, null, 2));
  } finally {
    await db.end();
  }
}

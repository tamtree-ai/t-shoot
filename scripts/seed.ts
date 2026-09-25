/**
 * Dev seed: one org, one owner member (07 §4, F1). Idempotent — safe to re-run.
 * `pnpm db:seed`
 *
 * Builds its own connection rather than importing `src/db` — that module is marked
 * "server-only" and throws outside a Next.js server bundle.
 */
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "../src/db/schema";

const db = drizzle({
  client: new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://tamshoot:tamshoot@localhost:5433/tamshoot" }),
  schema,
});

async function main() {
  const orgName = "Dilhan's Studio";
  const email = "admaduranga@gmail.com";

  let [org] = await db.select().from(schema.orgs).where(eq(schema.orgs.name, orgName)).limit(1);
  if (!org) {
    [org] = await db.insert(schema.orgs).values({ name: orgName }).returning();
    console.log(`created org ${org.id} (${orgName})`);
  }

  const [existing] = await db
    .select()
    .from(schema.members)
    .where(eq(schema.members.orgId, org.id))
    .limit(1);
  if (existing) {
    console.log(`member already seeded: ${existing.email} (${existing.role})`);
    return;
  }

  const [member] = await db
    .insert(schema.members)
    .values({ orgId: org.id, email, name: "Dilhan A.", role: "owner" })
    .returning();
  console.log(`created member ${member.id} (${member.email}, ${member.role})`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

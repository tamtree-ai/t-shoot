/**
 * Track W2 (the stick flows' half): publish t-shoot's stage flows into a Tamtree workspace,
 * by name, and print the `TAMTREE_FLOW_IDS` line the runtime adapter reads.
 *
 *   pnpm tamtree:provision [flows-dir]      default: $STICKSTAGE_PLUGIN_DIR/stage-flows
 *
 * Needs TAMTREE_BASE_URL and TAMTREE_PROVISION_KEY (scope `write:flows`, never `admin`).
 * Idempotent: a flow that exists gets its draft replaced and published; a new one is created
 * (create publishes version 1). Credentials are NOT provisioned here: the flows name
 * `stickstage` and `openrouter`, which the workspace owner adds in Tamtree. Tamtree binds a
 * node's credential by id, and a write:flows key can't list credentials, so the owner passes
 * the ids: TAMTREE_CREDENTIAL_IDS=stickstage=<uuid>,openrouter=<uuid>.
 */
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { parse } from "yaml";

import { LiveTamtreeAdapter } from "@/lib/tamtree/live-adapter";
import { STICK_FLOWS } from "@/lib/tamtree/stage-flows";
import type { components } from "@/lib/tamtree/v1";

type Schemas = components["schemas"];

const baseUrl = process.env.TAMTREE_BASE_URL;
const apiKey = process.env.TAMTREE_PROVISION_KEY;
if (!baseUrl || !apiKey) {
  console.error("Set TAMTREE_BASE_URL and TAMTREE_PROVISION_KEY (a write:flows key).");
  process.exit(1);
}
const credentialIds = new Map(
  (process.env.TAMTREE_CREDENTIAL_IDS ?? "")
    .split(",")
    .filter((pair) => pair.includes("="))
    .map((pair) => pair.trim().split("=") as [string, string]),
);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Swap each node's credential names for their ids; the names left unmapped are returned. */
function bindCredentials(spec: Schemas["FlowDefinition"]): string[] {
  const unmapped: string[] = [];
  for (const node of spec.nodes ?? []) {
    const creds = (node as { credentials?: Record<string, string> }).credentials;
    for (const [slot, ref] of Object.entries(creds ?? {})) {
      if (UUID.test(ref)) continue;
      const id = credentialIds.get(ref);
      if (id) creds![slot] = id;
      else unmapped.push(ref);
    }
  }
  return unmapped;
}

const dir =
  process.argv[2] ??
  join(process.env.STICKSTAGE_PLUGIN_DIR ?? join(homedir(), "sites/tamtree-plugins/stickstage-tamtree"), "stage-flows");

async function main(baseUrl: string, apiKey: string) {
  const tamtree = new LiveTamtreeAdapter({ baseUrl, apiKey });
  const existing = await tamtree.readFlowIds();
  const ids: Record<string, string> = {};

  for (const file of (await readdir(dir)).filter((f) => /\.ya?ml$/.test(f)).sort()) {
    const doc = parse(await readFile(join(dir, file), "utf8")) as { metadata: { name: string }; spec: Schemas["FlowDefinition"] };
    const name = doc.metadata.name;
    if (!(STICK_FLOWS as readonly string[]).includes(name)) {
      console.warn(`skip ${file}: "${name}" is not a t-shoot stage flow`);
      continue;
    }
    const unmapped = bindCredentials(doc.spec);
    if (unmapped.length) {
      const names = [...new Set(unmapped)];
      console.error(
        `${name} names credential ${names.join(", ")} but TAMTREE_CREDENTIAL_IDS has no id for it.\n` +
          `Set TAMTREE_CREDENTIAL_IDS=${names.map((n) => `${n}=<uuid>`).join(",")} (ids from Tamtree's Credentials page).`,
      );
      process.exit(1);
    }
    const id = existing.get(name);
    if (!id) {
      const created = await tamtree.json<Schemas["FlowOut"]>("/v1/flows", {
        method: "POST",
        body: JSON.stringify({ name, definition: doc.spec } satisfies Schemas["FlowCreate"]),
      });
      ids[name] = created.id;
      console.log(`created ${name} (${created.id}) v${created.version}`);
      continue;
    }
    await tamtree.json(`/v1/flows/${id}`, { method: "PUT", body: JSON.stringify({ definition: doc.spec } satisfies Schemas["FlowUpdate"]) });
    const published = await tamtree.json<Schemas["FlowPublishOut"]>(`/v1/flows/${id}/publish`, { method: "POST" });
    ids[name] = id;
    console.log(`updated ${name} (${id}): ${published.status}`);
  }

  const missing = STICK_FLOWS.filter((f) => !ids[f]);
  if (missing.length) {
    console.error(`missing from ${dir}: ${missing.join(", ")}`);
    process.exit(1);
  }
  console.log(`\nTAMTREE_FLOW_IDS=${Object.entries(ids).map(([n, i]) => `${n}=${i}`).join(",")}`);
}

main(baseUrl, apiKey).catch((err) => {
  console.error(err);
  process.exit(1);
});

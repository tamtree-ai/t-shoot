import "server-only";

import { and, eq } from "drizzle-orm";
import { library } from "stickstage/data";

import { db, schema } from "@/db";
import { stickCatalog } from "@/lib/stick/registry";

const HEX = /^#[0-9a-fA-F]{6}$/;
const HAIR = ["tuft-01", "bun-01", "spikes-01", "pigtails-01", "crop-01"] as const;
const BODY = ["shell-01", "tail-puff-01", "ears-long-01"] as const;
const HOUSE = new Set(Object.keys(library.characters));

export type SavedCharacter = {
  id: string;
  name: string;
  body: string;
  color: string;
  hair: string;
  accessory: string;
  personality: string;
  /** A full character document when this row was built, not just a renamed house body. */
  rig?: Record<string, unknown>;
};

function parseRig(accessory: string): Record<string, unknown> | undefined {
  if (!accessory.startsWith("{")) return undefined;
  try {
    const value = JSON.parse(accessory) as { schemaVersion?: unknown };
    if (value && typeof value === "object" && value.schemaVersion === 1) return value as Record<string, unknown>;
  } catch {
    return undefined;
  }
  return undefined;
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 16) || "cast";
}

export async function listCharacters(orgId: string): Promise<SavedCharacter[]> {
  const rows = await db.select().from(schema.customCharacters).where(eq(schema.customCharacters.orgId, orgId));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    body: row.body,
    color: row.color,
    hair: row.hair,
    accessory: row.accessory,
    personality: row.personality,
    ...(parseRig(row.accessory) ? { rig: parseRig(row.accessory) } : {}),
  }));
}

export async function saveCharacter(
  orgId: string,
  input: {
    name: string;
    body: string;
    color: string;
    hair: string;
    accessory: string;
    personality: string;
    original?: boolean;
    height?: number;
    head?: number;
    limb?: "line" | "bean";
    shoe?: string;
    say?: string;
  },
): Promise<string> {
  const name = input.name.trim().slice(0, 40);
  if (!name) throw new Error("Name the character.");
  if (!input.original) throw new Error("Confirm these are original characters.");
  if (!stickCatalog.characters.some((c) => c.id === input.body)) throw new Error("Start from a catalog body.");
  if (!HEX.test(input.color)) throw new Error("Use a colour like #ff6a3d.");
  const shoe = input.shoe && HEX.test(input.shoe) ? input.shoe : "#1b1b1f";
  const hair = (HAIR as readonly string[]).includes(input.hair) ? input.hair : "";
  const bodyPart = (BODY as readonly string[]).includes(input.accessory) ? input.accessory : "";
  const base = library.characters[input.body as keyof typeof library.characters];
  if (!base) throw new Error("Start from a catalog body.");
  const taken = new Set([...HOUSE, ...(await listCharacters(orgId)).map((c) => (typeof c.rig?.id === "string" ? c.rig.id : ""))]);
  let id = slug(name);
  let n = 2;
  while (taken.has(id)) id = `${slug(name)}${n++}`.slice(0, 20);
  const height = Math.min(1.2, Math.max(0.8, input.height ?? base.proportions.height));
  const head = Math.min(0.22, Math.max(0.12, input.head ?? base.proportions.headRadius));
  const limb = input.limb === "bean" ? "bean" : "line";
  const rig = {
    ...structuredClone(base),
    id,
    displayName: name,
    proportions: { ...base.proportions, height, headRadius: head },
    style: {
      ...base.style,
      headFill: input.color,
      footFill: shoe,
      torso: limb === "bean" ? { style: "bean" as const, fill: input.color, width: 0.13 } : { style: "line" as const },
    },
    accessories: [
      ...base.accessories.filter((a) => a.slot !== "hair" && a.slot !== "body"),
      ...(hair ? [{ slot: "hair" as const, id: hair }] : []),
      ...(bodyPart ? [{ slot: "body" as const, id: bodyPart }] : []),
    ],
    energy: base.energy ?? 0.55,
    personality: input.personality.trim().slice(0, 160),
    voice: { ...base.voice, ...(input.say?.trim() ? { say: input.say.trim().slice(0, 40) } : {}) },
  };
  const [row] = await db
    .insert(schema.customCharacters)
    .values({
      orgId,
      name,
      body: input.body,
      color: input.color,
      hair,
      accessory: JSON.stringify(rig),
      personality: input.personality.trim().slice(0, 200),
    })
    .returning();
  if (!row) throw new Error("The character was not saved.");
  return row.id;
}

export async function deleteCharacter(orgId: string, id: string): Promise<void> {
  await db.delete(schema.customCharacters).where(and(eq(schema.customCharacters.id, id), eq(schema.customCharacters.orgId, orgId)));
}

/** Personality lines for the characters in a cast, appended to the brief the writer sees. */
export function characterNotes(saved: SavedCharacter[], castIds: string[]): string {
  return saved
    .filter((c) => castIds.includes(c.id) || castIds.includes(c.body) || (typeof c.rig?.id === "string" && castIds.includes(c.rig.id)))
    .filter((c) => c.personality)
    .map((c) => `${c.name}: ${c.personality}`)
    .join("\n");
}

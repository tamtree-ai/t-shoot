import "server-only";

import { and, eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { stickCatalog } from "@/lib/stick/registry";

const HEX = /^#[0-9a-fA-F]{6}$/;

export type SavedCharacter = {
  id: string;
  name: string;
  body: string;
  color: string;
  hair: string;
  accessory: string;
  personality: string;
};

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
  }));
}

export async function saveCharacter(
  orgId: string,
  input: { name: string; body: string; color: string; hair: string; accessory: string; personality: string },
): Promise<string> {
  const name = input.name.trim().slice(0, 40);
  if (!name) throw new Error("Name the character.");
  if (!stickCatalog.characters.some((c) => c.id === input.body)) throw new Error("Start from a catalog body.");
  if (!HEX.test(input.color)) throw new Error("Use a colour like #ff6a3d.");
  const [row] = await db
    .insert(schema.customCharacters)
    .values({
      orgId,
      name,
      body: input.body,
      color: input.color,
      hair: input.hair.trim().slice(0, 40),
      accessory: input.accessory.trim().slice(0, 40),
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
    .filter((c) => castIds.includes(c.id) || castIds.includes(c.body))
    .filter((c) => c.personality)
    .map((c) => `${c.name}: ${c.personality}`)
    .join("\n");
}

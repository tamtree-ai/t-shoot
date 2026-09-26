/**
 * An org's defaults per production type (`type_settings`, 08 decision 4): what this client
 * allows. Read through the type's `tenantDefaultsSchema`, so a missing row, or one saved
 * before a field existed, parses to the type's defaults. Only an owner can change them.
 */
import "server-only";

import { and, eq } from "drizzle-orm";

import { db, schema } from "@/db";
import type { CurrentMember } from "@/lib/auth";
import { productionType, type TypeDefaults } from "@/types/registry";
import type { ProductionKind } from "@/types/types";

export async function getTypeDefaults<K extends ProductionKind>(orgId: string, kind: K): Promise<TypeDefaults<K>> {
  const [row] = await db
    .select({ settings: schema.typeSettings.settings })
    .from(schema.typeSettings)
    .where(and(eq(schema.typeSettings.orgId, orgId), eq(schema.typeSettings.kind, kind)));
  return productionType(kind).tenantDefaultsSchema.parse(row?.settings ?? {}) as TypeDefaults<K>;
}

export async function saveTypeDefaults<K extends ProductionKind>(member: CurrentMember, kind: K, raw: unknown): Promise<TypeDefaults<K>> {
  if (member.role !== "owner") throw new Error("Only the workspace owner can change these settings.");
  const settings = productionType(kind).tenantDefaultsSchema.parse(raw) as TypeDefaults<K>;
  await db
    .insert(schema.typeSettings)
    .values({ orgId: member.orgId, kind, settings, updatedBy: member.memberId })
    .onConflictDoUpdate({
      target: [schema.typeSettings.orgId, schema.typeSettings.kind],
      set: { settings, updatedBy: member.memberId, updatedAt: new Date() },
    });
  return settings;
}

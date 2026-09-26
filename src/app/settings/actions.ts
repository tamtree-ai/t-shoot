"use server";

import { revalidatePath } from "next/cache";

import { getCurrentMember } from "@/lib/auth";
import { saveTypeDefaults } from "@/services/type-settings";
import { PRODUCTION_KINDS, type ProductionKind } from "@/types/types";

export async function saveTypeDefaultsAction(kind: ProductionKind, raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!PRODUCTION_KINDS.includes(kind)) return { ok: false, error: "Unknown production type." };
  try {
    await saveTypeDefaults(await getCurrentMember(), kind, raw);
    revalidatePath("/settings");
    revalidatePath("/projects/new");
    return { ok: true };
  } catch (err) {
    // A zod refusal carries its field messages; show the first one.
    const issues = (err as { issues?: { message: string }[] }).issues;
    return { ok: false, error: issues?.[0]?.message ?? (err instanceof Error ? err.message : "Something went wrong.") };
  }
}

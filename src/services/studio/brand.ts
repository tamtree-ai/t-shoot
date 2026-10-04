/** The studio's brand (plan §5.4): name, logo, accent, room theme, email footer. Resolved by org today, by Host later. */
import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import sharp from "sharp";
import { z } from "zod";

import { db, schema } from "@/db";
import { getBlobStore } from "@/lib/blob";
import { normaliseHex } from "@/lib/studio/color";
import { StudioError } from "@/lib/studio/errors";
import { removeFiles } from "./files";

export type Brand = {
  orgId: string;
  studioName: string;
  logoFileId: string | null;
  accentHex: string;
  roomTheme: "light" | "dark" | "auto";
  emailFooter: string;
  website: string | null;
  supportEmail: string | null;
};

export const DEFAULT_BRAND = { studioName: "Studio", accentHex: "#1f6feb", roomTheme: "light" as const, emailFooter: "" };

export async function getBrand(orgId: string): Promise<Brand> {
  const [row] = await db.select().from(schema.studioBrand).where(eq(schema.studioBrand.orgId, orgId)).limit(1);
  if (row) return row;
  const [org] = await db.select({ name: schema.orgs.name }).from(schema.orgs).where(eq(schema.orgs.id, orgId)).limit(1);
  return { orgId, ...DEFAULT_BRAND, studioName: org?.name || DEFAULT_BRAND.studioName, logoFileId: null, website: null, supportEmail: null };
}

const optionalUrl = z
  .string()
  .trim()
  .max(200)
  .transform((s) => (s === "" ? null : /^https?:\/\//i.test(s) ? s : `https://${s}`))
  .refine((s) => s === null || /^https?:\/\/[^\s/]+\.[^\s/]+/.test(s), "That website address doesn't look right.");

const optionalEmail = z
  .string()
  .trim()
  .max(200)
  .transform((s) => (s === "" ? null : s.toLowerCase()))
  .refine((s) => s === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), "That support email doesn't look right.");

export const brandInput = z.object({
  studioName: z.string().trim().min(1, "Give the studio a name.").max(60, "Keep the studio name under 60 characters."),
  accentHex: z.string().transform((s, ctx) => {
    const h = normaliseHex(s);
    if (!h) ctx.addIssue({ code: "custom", message: "The accent colour must be a hex colour like #1f6feb." });
    return h ?? "#1f6feb";
  }),
  roomTheme: z.enum(["light", "dark", "auto"]),
  emailFooter: z.string().max(600, "Keep the email footer under 600 characters.").default(""),
  website: optionalUrl,
  supportEmail: optionalEmail,
});

export async function saveBrand(orgId: string, raw: unknown): Promise<Brand> {
  const input = brandInput.parse(raw);
  await db.insert(schema.studioBrand).values({ orgId, ...input }).onConflictDoUpdate({ target: schema.studioBrand.orgId, set: { ...input, updatedAt: new Date() } });
  return getBrand(orgId);
}

export const LOGO_MAX_BYTES = 4 * 1024 * 1024;

/** Stores a logo: resized to 640px wide max as a WebP (keeps transparency), recorded as a ready file. Replaces and removes the old one. */
export async function saveLogo(orgId: string, name: string, bytes: Buffer): Promise<string> {
  if (bytes.length === 0) throw new StudioError("That file is empty.");
  if (bytes.length > LOGO_MAX_BYTES) throw new StudioError("The logo is over 4 MB. Export a smaller one.");
  let png: Buffer; // the encoded logo (webp)
  let info: sharp.OutputInfo;
  try {
    ({ data: png, info } = await sharp(bytes, { limitInputPixels: 100_000_000 }).rotate().resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true }).webp({ quality: 92, alphaQuality: 100 }).toBuffer({ resolveWithObject: true }));
  } catch {
    throw new StudioError("That logo couldn't be read. Use a PNG, JPG, WebP or SVG.");
  }
  const fileId = randomUUID();
  const key = `${orgId}/${fileId}/logo.webp`;
  const store = getBlobStore();
  await store.put(key, new Blob([new Uint8Array(png)]).stream());
  const previous = (await getBrand(orgId)).logoFileId;
  await db.transaction(async (tx) => {
    await tx.insert(schema.studioFiles).values({
      id: fileId,
      orgId,
      originalKey: key,
      originalName: name.slice(0, 200) || "logo",
      mime: "image/webp",
      bytes: png.length,
      sha256: createHash("sha256").update(png).digest("hex"),
      width: info.width,
      height: info.height,
      previewKey: key,
      thumbKey: key,
      processing: "ready",
    });
    const b = await getBrand(orgId);
    await tx
      .insert(schema.studioBrand)
      .values({ orgId, studioName: b.studioName, accentHex: b.accentHex, roomTheme: b.roomTheme, emailFooter: b.emailFooter, website: b.website, supportEmail: b.supportEmail, logoFileId: fileId })
      .onConflictDoUpdate({ target: schema.studioBrand.orgId, set: { logoFileId: fileId, updatedAt: new Date() } });
  });
  if (previous) await removeFiles(orgId, [previous]);
  return fileId;
}

export async function removeLogo(orgId: string): Promise<void> {
  const { logoFileId } = await getBrand(orgId);
  if (!logoFileId) return;
  await db.update(schema.studioBrand).set({ logoFileId: null, updatedAt: new Date() }).where(eq(schema.studioBrand.orgId, orgId));
  await removeFiles(orgId, [logoFileId]);
}

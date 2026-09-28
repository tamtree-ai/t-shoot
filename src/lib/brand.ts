import { z } from "zod";

/** Fonts the app already loads, plus two system faces. No extra license. */
export const BRAND_FONTS = [
  { id: "geist", label: "Geist", family: "var(--font-sans), sans-serif" },
  { id: "instrument", label: "Instrument Serif", family: "var(--font-display), serif" },
  { id: "georgia", label: "Georgia", family: "Georgia, serif" },
  { id: "courier", label: "Courier", family: '"Courier New", monospace' },
] as const;

export const BRAND_POSITIONS = ["top", "middle", "bottom"] as const;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #ff6a3d.");

export const BrandKit = z.object({
  font: z.enum(BRAND_FONTS.map((f) => f.id) as [string, ...string[]]).default("geist"),
  captionColor: hex.default("#ffffff"),
  highlightColor: hex.default("#ff6a3d"),
  position: z.enum(BRAND_POSITIONS).default("bottom"),
  logoUrl: z.string().url().refine((u) => u.startsWith("https://"), "The logo link has to start with https://").optional().or(z.literal("")),
  logoPlace: z.enum(["watermark", "end-card"]).default("watermark"),
  endCardCta: z.string().trim().max(80).default(""),
  endCardUrl: z.string().trim().max(200).default(""),
  endCardS: z.union([z.literal(1.5), z.literal(2)]).default(1.5),
  accent: hex.default("#ff6a3d"),
});
export type BrandKit = z.infer<typeof BrandKit>;

export function fontFamily(font: string): string {
  return BRAND_FONTS.find((f) => f.id === font)?.family ?? BRAND_FONTS[0].family;
}

export function emptyBrand(): BrandKit {
  return BrandKit.parse({});
}

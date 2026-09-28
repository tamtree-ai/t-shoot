/**
 * The two frames a stick skit can be. Mirrors StickStage's in-progress contract
 * (`repo-writer` `src/engine/format/aspect.ts`): a short is 1080×1920, widescreen
 * is 1920×1080. Omitting the frame means a short. AI clips stay 1080×1920 and do
 * not use this module.
 */
import { BriefSchema } from "stickstage";

export const ASPECTS = ["9:16", "16:9"] as const;
export type Aspect = (typeof ASPECTS)[number];

export const FRAME: Record<Aspect, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
};

export const ASPECT_LABEL: Record<Aspect, string> = {
  "9:16": "Short",
  "16:9": "Widescreen",
};

/** Tailwind needs the class written out in full. */
export function frameClass(aspect: Aspect): string {
  return aspect === "16:9" ? "aspect-video" : "aspect-[9/16]";
}

export function isAspect(value: unknown): value is Aspect {
  return value === "9:16" || value === "16:9";
}

/** Which shipped frame these pixels are. Anything wider than tall is widescreen. */
export function aspectOfSize(width: number, height: number): Aspect {
  const exact = ASPECTS.find((id) => FRAME[id].width === width && FRAME[id].height === height);
  if (exact) return exact;
  if (!(width > 0) || !(height > 0)) return "9:16";
  return width / height > 1 ? "16:9" : "9:16";
}

export function aspectOfBrief(brief: { aspect?: unknown } | null | undefined): Aspect {
  return isAspect(brief?.aspect) ? brief.aspect : "9:16";
}

type FrameMeta = { aspect?: unknown; width?: unknown; height?: unknown };

function metaOf(skit: unknown): FrameMeta | undefined {
  if (!skit || typeof skit !== "object" || !("meta" in skit)) return undefined;
  const meta = (skit as { meta?: unknown }).meta;
  return meta && typeof meta === "object" ? (meta as FrameMeta) : undefined;
}

/** The frame a skit document states, when it states one. Missing size and aspect is not a short yet. */
export function explicitFrame(skit: unknown): Aspect | undefined {
  const meta = metaOf(skit);
  if (!meta) return undefined;
  if (isAspect(meta.aspect)) return meta.aspect;
  if (typeof meta.width === "number" && typeof meta.height === "number") return aspectOfSize(meta.width, meta.height);
  return undefined;
}

export function aspectOfSkit(skit: unknown, fallback: Aspect = "9:16"): Aspect {
  return explicitFrame(skit) ?? fallback;
}

/** Largest rectangle of `aspect` that fits inside a box. */
export function fitFrame(width: number, height: number, aspect: Aspect): { width: number; height: number } {
  if (width < 8 || height < 8) return { width: 0, height: 0 };
  const shape = FRAME[aspect].width / FRAME[aspect].height;
  const byHeight = height * shape;
  if (byHeight <= width) return { width: Math.floor(byHeight), height: Math.floor(height) };
  return { width: Math.floor(width), height: Math.floor(width / shape) };
}

/**
 * The vendored package's brief schema is strict. Probe it once: a later vendor that
 * accepts `aspect` flips this without a UI change.
 */
let takesAspect: boolean | undefined;
export function engineTakesBriefAspect(): boolean {
  if (takesAspect === undefined) {
    const base = { topic: "x", cast: [{ id: "a", character: "a" }] };
    const plain = BriefSchema.safeParse(base).success;
    takesAspect = plain && BriefSchema.safeParse({ ...base, aspect: "9:16" }).success;
  }
  return takesAspect;
}

/**
 * The vendored skit schema rejects `meta.aspect`. Copy the frame into width and height
 * and drop the key so the local checker can still compile a skit the newer service wrote.
 * The stored document is not this copy.
 */
export function skitForEngine<T>(skit: T): T {
  if (!skit || typeof skit !== "object") return skit;
  const meta = (skit as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object" || !("aspect" in meta)) return skit;
  const doc = structuredClone(skit) as unknown as { meta: { aspect?: unknown; width?: number; height?: number } };
  const aspect = isAspect(doc.meta.aspect) ? doc.meta.aspect : undefined;
  if (aspect && doc.meta.width == null && doc.meta.height == null) {
    doc.meta.width = FRAME[aspect].width;
    doc.meta.height = FRAME[aspect].height;
  }
  delete doc.meta.aspect;
  return doc as T;
}

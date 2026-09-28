import type { ReactNode } from "react";

import { fontFamily, type BrandKit } from "@/lib/brand";

/** Phone-frame overlays for a show's brand. The film itself still comes from StickStage. */
export function BrandFrame({ brand, children }: { brand?: BrandKit | null; children: ReactNode }) {
  if (!brand) return children;
  const place = brand.position === "top" ? "top-3" : brand.position === "middle" ? "top-1/2 -translate-y-1/2" : "bottom-16";
  return (
    <div className="relative" style={{ ["--brand-accent" as string]: brand.accent }}>
      {children}
      <span className={`pointer-events-none absolute inset-x-3 ${place} text-center text-[13px] font-semibold`} style={{ color: brand.captionColor, fontFamily: fontFamily(brand.font) }}>
        <span style={{ color: brand.highlightColor }}> </span>
      </span>
      {brand.logoUrl && brand.logoPlace === "watermark" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logoUrl} alt="" className="pointer-events-none absolute top-3 right-3 h-8 w-8 object-contain" />
      )}
      {(brand.endCardCta || brand.logoUrl) && (
        <span className="pointer-events-none absolute inset-x-3 bottom-3 rounded-md px-2 py-1 text-center text-[11px]" style={{ color: brand.captionColor, background: brand.accent }}>
          {brand.endCardCta || "Follow"}
          {brand.endCardUrl ? ` · ${brand.endCardUrl}` : ""}
        </span>
      )}
    </div>
  );
}

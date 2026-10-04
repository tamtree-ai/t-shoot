"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { frameClass } from "@/lib/stick/frame";
import { stickCatalog } from "@/lib/stick/registry";
import { setAspect, setLabel } from "@/types/stick-skit/catalog";

import { SetThumb } from "./Thumbs";
import { usePopover } from "./usePopover";

/** A set menu drawn by the engine. The closed control is a thumbnail; the open one is the grid. */
export function SetPicker({
  value,
  options,
  label,
  align = "start",
  onChange,
}: {
  value: string;
  options: { id: string; label: string }[];
  label: string;
  align?: "start" | "end";
  onChange: (id: string) => void;
}) {
  const { open, setOpen, root, panelId } = usePopover();
  const button = useRef<HTMLButtonElement>(null);
  // The panel is fixed to the viewport so a scrolling toolbar (overflow-x-auto) can't clip it.
  const [anchor, setAnchor] = useState<{ top: number; left?: number; right?: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const r = button.current?.getBoundingClientRect();
      if (!r) return;
      setAnchor(align === "end" ? { top: r.bottom + 6, right: window.innerWidth - r.right } : { top: r.bottom + 6, left: r.left });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, align]);

  const current = options.find((o) => o.id === value);
  const name = current?.label ?? (value ? setLabel(value) : "Set");

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        title={descriptionOf(value)}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 items-center gap-2 rounded-lg border border-line bg-canvas-script pr-2.5 pl-1 text-[13px] text-fg"
      >
        <span className="relative h-7 w-[22px] overflow-hidden rounded-[3px] bg-[#0c0c0f]">
          {value ? <SetThumb id={value} className="absolute inset-0" /> : null}
        </span>
        {name}
      </button>
      {open && (
        <div
          id={panelId}
          role="listbox"
          aria-label={label}
          style={anchor ?? { visibility: "hidden" }}
          className="fixed z-30 grid max-h-[min(420px,70vh)] w-[min(440px,80vw)] grid-cols-4 gap-1.5 overflow-y-auto rounded-xl border border-line bg-panel p-2 shadow-xl"
        >
          {options.map((o) => {
            const selected = o.id === value;
            return (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={selected}
                title={descriptionOf(o.id)}
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
                className={`relative ${frameClass(setAspect(o.id))} overflow-hidden rounded-lg border bg-[#0c0c0f] ${selected ? "border-accent shadow-[0_0_0_1px_var(--color-accent)]" : "border-line hover:border-line-strong"}`}
              >
                <SetThumb id={o.id} className="absolute inset-0" />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 pt-4 pb-1 text-left text-[10px] font-medium text-white">{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function descriptionOf(id: string): string | undefined {
  return stickCatalog.sets.find((s) => s.id === id)?.description;
}

"use client";

import { useEffect, useId, useRef, useState } from "react";

import { stickCatalog } from "@/lib/stick/registry";
import { setLabel } from "@/types/stick-skit/catalog";

import { SetThumb } from "./Thumbs";

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
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = options.find((o) => o.id === value);
  const name = current?.label ?? (value ? setLabel(value) : "Set");

  return (
    <div ref={root} className="relative">
      <button
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
          className={`absolute z-30 mt-1.5 grid max-h-[min(420px,70vh)] w-[min(440px,80vw)] grid-cols-4 gap-1.5 overflow-y-auto rounded-xl border border-line bg-panel p-2 shadow-xl ${align === "end" ? "right-0" : "left-0"}`}
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
                className={`relative aspect-[9/16] overflow-hidden rounded-lg border bg-[#0c0c0f] ${selected ? "border-accent shadow-[0_0_0_1px_var(--color-accent)]" : "border-line hover:border-line-strong"}`}
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

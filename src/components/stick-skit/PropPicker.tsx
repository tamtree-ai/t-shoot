"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from "react";

import {
  closestProps,
  propCatalog,
  propCategories,
  propLabel,
  recentPropIds,
  rememberProp,
  searchProps,
  subscribeSuggestProps,
  suggestProps,
  suggestPropsEnabled,
  type PropHit,
  type PropInfo,
} from "@/lib/stick/prop-search";
import type { BeatPatch, EditableBeat } from "@/types/stick-skit/draft";

import { CharacterThumb, PropThumb } from "./Thumbs";
import { usePopover } from "./usePopover";

let sessionCategory = "all";
let sessionScroll = 0;

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return narrow;
}

function beatNo(beats: EditableBeat[], id: string): string {
  const i = beats.findIndex((b) => b.id === id);
  return i < 0 ? "" : String(i + 1).padStart(2, "0");
}

function Tile({
  prop,
  via,
  selected,
  active,
  optionId,
  onPick,
  onHover,
}: {
  prop: PropInfo;
  via: string | null;
  selected: boolean;
  active: boolean;
  optionId: string;
  onPick: () => void;
  onHover: (id: string | null) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const root = el.closest("[data-prop-grid]");
    const observer = new IntersectionObserver(([entry]) => setNear(entry?.isIntersecting ?? false), { root: root instanceof Element ? root : null, rootMargin: "200px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <button
      ref={ref}
      type="button"
      role="option"
      id={optionId}
      aria-selected={selected || active}
      aria-label={`${prop.name}, ${prop.category}`}
      onMouseEnter={() => onHover(prop.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(prop.id)}
      onBlur={() => onHover(null)}
      onClick={onPick}
      className={`flex flex-col items-center gap-1 rounded-lg border px-1 pt-1.5 pb-1.5 ${selected || active ? "border-accent bg-accent-soft" : "border-transparent hover:bg-hover"}`}
    >
      <span className="relative grid size-16 place-items-center rounded-md bg-[#f3efe8]">{near ? <PropThumb id={prop.id} className="size-14" /> : null}</span>
      <span className="max-w-full truncate text-[11px] leading-tight text-fg">{prop.name}</span>
      {via ? <span className="max-w-full truncate text-[10px] text-fg-muted">matched {via}</span> : null}
    </button>
  );
}

export function PropPicker({
  label,
  props,
  selected,
  multiple = false,
  suggestions,
  used,
  characterId,
  facing = "right",
  onPick,
  onClose,
}: {
  label: string;
  props: PropInfo[];
  /** One id, or the ids already chosen when `multiple`. */
  selected: string | string[] | null;
  multiple?: boolean;
  suggestions: PropHit[];
  used: { id: string; label: string }[];
  characterId?: string;
  facing?: "left" | "right";
  onPick: (id: string | null) => void;
  onClose: () => void;
}) {
  const narrow = useNarrow();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(sessionCategory);
  const [active, setActive] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const recent = recentPropIds();
  const byId = new Map(props.map((p) => [p.id, p]));
  const categories = propCategories(props);
  const categoryOk = categories.some((c) => c.id === category) ? category : "all";
  const hits = searchProps(query, props, categoryOk);
  const ordered = query.trim()
    ? hits
    : [
        ...recent.filter((id) => hits.some((h) => h.id === id)).map((id) => hits.find((h) => h.id === id)!),
        ...hits.filter((h) => !recent.includes(h.id)),
      ];
  const tiles = ordered.flatMap((h) => {
    const prop = byId.get(h.id);
    return prop ? [{ prop, via: h.via }] : [];
  });
  const cols = narrow ? 3 : 4;
  const chosen = new Set(Array.isArray(selected) ? selected : selected ? [selected] : []);
  const empty = query.trim().length > 0 && tiles.length === 0;
  const closest = empty ? closestProps(query, props, 2) : [];
  const sign = empty && byId.has("sign") ? byId.get("sign")! : null;
  const preview = hover ?? (tiles[active]?.prop.id ?? null);

  useEffect(() => {
    input.current?.focus();
    const node = grid.current;
    if (node) node.scrollTop = sessionScroll;
  }, []);

  function choose(id: string | null) {
    if (id) rememberProp(id);
    sessionCategory = categoryOk;
    onPick(id);
    if (!multiple) onClose();
  }

  function onKey(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (tiles.length === 0) return;
      e.preventDefault();
      const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "ArrowDown" ? cols : -cols;
      setActive((i) => Math.max(0, Math.min(tiles.length - 1, i + delta)));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const tile = tiles[active];
      if (tile) choose(tile.prop.id);
      else if (sign) choose(sign.id);
    }
  }

  const panel = (
    <div
      role="dialog"
      aria-label={label}
      className={
        narrow
          ? "fixed inset-x-0 bottom-0 z-40 flex max-h-[85vh] flex-col overflow-hidden rounded-t-2xl border border-line bg-raised shadow-[0_12px_40px_rgb(0_0_0/0.45)]"
          : "absolute top-full left-0 z-40 mt-1.5 flex max-h-[min(560px,70vh)] w-[min(420px,80vw)] flex-col overflow-hidden rounded-xl border border-line bg-raised shadow-[0_12px_40px_rgb(0_0_0/0.45)]"
      }
    >
      <div className="flex items-start gap-3 border-b border-line p-2">
        <input
          ref={input}
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={tiles[active] ? `${listId}-${tiles[active].prop.id}` : undefined}
          aria-label="Search props"
          value={query}
          placeholder="Search props — try chips, coffee, keys"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKey}
          className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-panel px-2.5 text-[13px] text-fg placeholder:text-fg-muted"
        />
        {preview && characterId ? (
          <span className="relative h-16 w-11 shrink-0 overflow-hidden rounded-md border border-line bg-[#0c0c0f]">
            <CharacterThumb id={characterId} holding={preview} facing={facing} expression="neutral" className="absolute inset-0" />
          </span>
        ) : null}
      </div>

      {suggestions.length > 0 && !query.trim() && (
        <section className="flex flex-col gap-1.5 px-2 pt-2">
          <h3 className="text-[10px] font-semibold tracking-[0.08em] text-fg-muted uppercase">For this line</h3>
          <div className="flex flex-wrap gap-1">
            {suggestions.map((hit) => {
              const prop = byId.get(hit.id);
              if (!prop) return null;
              return (
                <button key={hit.id} type="button" onClick={() => choose(hit.id)} className="h-7 rounded-full border border-dashed border-line px-2.5 text-[12px] text-fg-2 hover:bg-hover">
                  {prop.name}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {used.length > 0 && !query.trim() && (
        <section className="flex flex-col gap-1.5 px-2 pt-2">
          <h3 className="text-[10px] font-semibold tracking-[0.08em] text-fg-muted uppercase">In this skit</h3>
          <div className="flex flex-wrap gap-1">
            {used.map((u) => (
              <button key={u.id} type="button" onClick={() => choose(u.id)} className="h-7 rounded-full border border-line px-2.5 text-[12px] text-fg-2 hover:bg-hover">
                {propLabel(u.id, props)}
                <span className="text-fg-muted"> · {u.label}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="flex gap-1 overflow-x-auto px-2 py-2">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={categoryOk === c.id}
            onClick={() => {
              setCategory(c.id);
              sessionCategory = c.id;
              setActive(0);
            }}
            className={`h-7 shrink-0 rounded-full border px-2.5 text-[12px] ${categoryOk === c.id ? "border-accent bg-accent-soft text-fg" : "border-line text-fg-2"}`}
          >
            {c.label} <span className="text-fg-muted">{c.count}</span>
          </button>
        ))}
      </div>

      <div aria-live="polite" className="sr-only">
        {empty ? `No prop called ${query.trim()}` : `${tiles.length} ${tiles.length === 1 ? "prop" : "props"}`}
      </div>

      {empty ? (
        <div className="px-3 pb-2 text-[13px] text-fg-2">
          <p>
            No prop called <span className="text-fg">{query.trim()}</span>.
            {closest.length > 0 ? ` Closest: ${closest.map((p) => p.name).join(", ")}.` : ""}
          </p>
          {sign ? (
            <button type="button" onClick={() => choose(sign.id)} className="mt-2 h-8 rounded-lg border border-line px-2.5 text-[13px] hover:bg-hover">
              Hold a sign instead
            </button>
          ) : null}
        </div>
      ) : (
        <div
          ref={grid}
          id={listId}
          role="listbox"
          aria-label={label}
          data-prop-grid
          onScroll={(e) => {
            sessionScroll = e.currentTarget.scrollTop;
          }}
          className="grid min-h-0 flex-1 grid-cols-3 gap-0.5 overflow-y-auto px-1.5 pb-1 sm:grid-cols-4"
        >
          {tiles.map(({ prop, via }, i) => (
            <Tile
              key={prop.id}
              prop={prop}
              via={query.trim() ? via : null}
              selected={chosen.has(prop.id)}
              active={i === active}
              optionId={`${listId}-${prop.id}`}
              onPick={() => choose(prop.id)}
              onHover={setHover}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-line px-2 py-1.5">
        <button type="button" onClick={() => choose(null)} className="h-8 rounded-lg px-2 text-[13px] text-fg-2 hover:bg-hover">
          None / put away
        </button>
        <span className="text-[12px] text-fg-muted">{empty ? "0 props" : `${tiles.length} ${tiles.length === 1 ? "prop" : "props"}`}</span>
      </div>
    </div>
  );

  return panel;
}

export function PropChip({
  beat,
  beats,
  what,
  characterId,
  facing = "right",
  onEdit,
}: {
  beat: EditableBeat;
  beats: EditableBeat[];
  what: string;
  characterId?: string;
  facing?: "left" | "right";
  onEdit: (patch: BeatPatch) => void;
}) {
  const { open, setOpen, root } = usePopover();
  const trigger = useRef<HTMLButtonElement>(null);
  const props = propCatalog();
  const suggest = useSyncExternalStore(subscribeSuggestProps, suggestPropsEnabled, () => true);
  const held = beat.prop ?? (beat.carried ? { id: beat.carried.id, hand: "R" as const } : null);
  const carried = !beat.prop && beat.carried ? beat.carried : null;
  const name = held ? propLabel(held.id, props) : "";
  const from = carried?.from ? beatNo(beats, carried.from) : "";
  const suggestions = suggest && beat.line ? suggestProps(beat.line, props) : [];
  const strong = !held ? suggestions.find((h) => h.score >= 90) : undefined;
  const used = new Map<string, string>();
  for (const other of beats) {
    if (other.id === beat.id) continue;
    const id = other.prop?.id;
    if (id && !used.has(id)) used.set(id, `from ${beatNo(beats, other.id)}`);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") trigger.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const text = !held ? "+ Prop" : carried ? `${name}${from ? ` · from ${from}` : ""}` : name;
  const aria = !held ? `${what}: prop, none` : carried ? `${what}: prop, ${name}${from ? `, from beat ${Number(from)}` : ""}` : `${what}: prop, ${name}`;

  return (
    <div ref={root} className="relative flex items-center gap-1">
      <button
        ref={trigger}
        type="button"
        aria-label={aria}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className={`flex h-7 items-center gap-1.5 rounded-full border px-2 text-xs ${held && !carried ? "border-line text-fg" : "border-line text-fg-muted"} ${carried ? "opacity-60" : ""}`}
      >
        {held ? (
          <span className="relative size-4 overflow-hidden rounded-[3px] bg-[#f3efe8]">
            <PropThumb id={held.id} className="absolute inset-0" />
          </span>
        ) : null}
        {text}
      </button>
      {strong ? (
        <button
          type="button"
          onClick={() => onEdit({ prop: strong.id })}
          className="h-7 rounded-full border border-dashed border-line px-2 text-xs text-fg-3 hover:bg-hover"
        >
          + {propLabel(strong.id, props)}?
        </button>
      ) : null}
      {open && (
        <PropPicker
          label={`${what}: props`}
          props={props}
          selected={beat.prop?.id ?? null}
          suggestions={suggestions}
          used={[...used.entries()].map(([id, label]) => ({ id, label }))}
          characterId={characterId}
          facing={facing}
          onPick={(id) => onEdit({ prop: id })}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

/** The brief's "must show" list. The same picker, keeping several ids. */
export function BriefProps({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { open, setOpen, root } = usePopover();
  const props = propCatalog();
  return (
    <div ref={root} className="relative flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((id) => (
          <button key={id} type="button" onClick={() => onChange(value.filter((x) => x !== id))} className="flex h-7 items-center gap-1.5 rounded-full border border-line px-2 text-xs text-fg">
            <span className="relative size-4 overflow-hidden rounded-[3px] bg-[#f3efe8]">
              <PropThumb id={id} className="absolute inset-0" />
            </span>
            {propLabel(id, props)}
            <span className="text-fg-muted">×</span>
          </button>
        ))}
        <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="h-7 rounded-full border border-dashed border-line px-2.5 text-xs text-fg-3 hover:bg-hover">
          + Prop
        </button>
      </div>
      {open && (
        <PropPicker
          label="Props that must be on screen"
          props={props}
          multiple
          selected={value}
          suggestions={[]}
          used={[]}
          onPick={(id) => {
            if (id === null) onChange([]);
            else onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id].slice(0, 8));
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

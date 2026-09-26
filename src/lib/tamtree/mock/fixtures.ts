import type { Beat } from "../stage-flows";

/** The canvas project ("Three hearts") — the `three-hearts` scenario's script. */
export const THREE_HEARTS_BEATS: Beat[] = [
  {
    narration: "An octopus has three hearts, and it needs every one of them.",
    visual_prompt: "Slow push through dark open water; an octopus drifts into a shaft of light.",
  },
  {
    narration: "Its blood is blue, built on copper instead of iron.",
    visual_prompt: "Stylised cutaway of a blue vein glowing against deep red coral.",
  },
  {
    narration: "Two hearts push blood through the gills to pick up oxygen.",
    visual_prompt: "Macro close-up of an octopus mantle, gill slits pulsing slowly, soft violet light.",
  },
  {
    narration: "The third sends it around the rest of the body.",
    visual_prompt: "Wide shot: the octopus unfurls its arms across a rocky ledge.",
  },
  {
    narration: "When an octopus swims, that third heart stops beating.",
    visual_prompt: "The octopus jets away in a burst of ink; the frame holds still.",
  },
  {
    narration: "Which is why it would rather crawl than swim.",
    visual_prompt: "Arms walking across sand, unhurried, towards camera.",
  },
];

/** Prices the mock charges, close to the real OpenRouter-backed plugin (03 §2). */
export const MOCK_PRICES_USD = {
  "studio-script": 0.003,
  "studio-narrate": 0.004,
  "studio-clip": 0.48,
  "studio-render": 0,
  "stick-script": 0.004,
  "stick-produce": 0.018,
} as const;

/** Nominal durations in ms at speed 1 (07 §3). */
export const MOCK_DURATIONS_MS = {
  "studio-script": 2_000,
  "studio-narrate": 1_000,
  "studio-clip": 12_000,
  "studio-render": 8_000,
  "stick-script": 2_000,
  "stick-produce": 15_000,
} as const;

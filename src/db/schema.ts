/**
 * Tamshoot's own document (02-architecture §4). Tamtree owns runs, assets, cost and
 * traces; this schema only *references* them (tamtree_run_id, asset ids) and caches
 * what the UI needs.
 *
 * v0 — frontend-first (Track F). Money is stored as numeric(12,6) USD, never float.
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const usd = (name: string) => numeric(name, { precision: 12, scale: 6 });

// ── tenancy ────────────────────────────────────────────────────────────────
export const orgs = pgTable("orgs", {
  id: id(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const memberRole = pgEnum("member_role", ["owner", "editor"]);

export const members = pgTable(
  "members",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    role: memberRole("role").notNull().default("editor"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("members_org_email").on(t.orgId, t.email)],
);

/** One Tamtree workspace per org. The key is encrypted at rest (Track W2). */
export const tamtreeConnections = pgTable("tamtree_connections", {
  id: id(),
  orgId: uuid("org_id").notNull().unique().references(() => orgs.id, { onDelete: "cascade" }),
  baseUrl: text("base_url").notNull(),
  apiKeyCiphertext: text("api_key_ciphertext").notNull(),
  /** Tamtree flow ids of the four published stage flows, by stage name. */
  flowIds: jsonb("flow_ids").$type<Record<string, string>>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ── the document ───────────────────────────────────────────────────────────
export const projectStep = pgEnum("project_step", ["brief", "script", "edit", "review", "export"]);

export const projects = pgTable("projects", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  step: projectStep("step").notNull().default("brief"),
  /** Brief: topic/prompt, length, tone, voice, look (stage-flows Brief). */
  brief: jsonb("brief").$type<Record<string, unknown>>().notNull(),
  voice: text("voice").notNull(),
  limitUsd: usd("limit_usd").notNull().default("5"),
  scriptApprovedAt: timestamp("script_approved_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => members.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const scenes = pgTable(
  "scenes",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    /** Order in the film; reorder rewrites positions. */
    position: integer("position").notNull(),
    title: text("title").notNull(),
    narration: text("narration").notNull(),
    visualPrompt: text("visual_prompt").notNull(),
    /** Narration asset + timings of the current voice; null until recorded. */
    narrationAssetId: text("narration_asset_id"),
    narrationDurationS: real("narration_duration_s"),
    phrases: jsonb("phrases").$type<{ text: string; start_s: number; end_s: number }[]>(),
    /** The words changed after the last narrate: blocks export (03 §2, 06 §4.1). */
    voiceOutOfDate: boolean("voice_out_of_date").notNull().default(false),
    /**
     * Set by the last "Ask for a script change" that touched this scene; cleared by
     * Keep or Undo (03 §1.2, Script.dc.html's "Changed by your note" pill).
     */
    revisionNote: text("revision_note"),
    previousNarration: text("previous_narration"),
    previousVisualPrompt: text("previous_visual_prompt"),
    chosenTakeId: uuid("chosen_take_id"),
    /** Trim in seconds within the chosen clip; never below the narration (06 §4.2). */
    trimStartS: real("trim_start_s").notNull().default(0),
    trimEndS: real("trim_end_s"),
    /** Caption text overrides by phrase index — the free "fix a word" edit. */
    captionOverrides: jsonb("caption_overrides").$type<Record<number, string>>().notNull().default({}),
    droppedAt: timestamp("dropped_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("scenes_project_position").on(t.projectId, t.position)],
);

export const takes = pgTable(
  "takes",
  {
    id: id(),
    sceneId: uuid("scene_id").notNull().references(() => scenes.id, { onDelete: "cascade" }),
    /** 1-based; part of ClipIn so a new take is never served from reuse. */
    number: integer("number").notNull(),
    visualPrompt: text("visual_prompt").notNull(),
    clipAssetId: text("clip_asset_id"),
    durationS: real("duration_s"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("takes_scene_number").on(t.sceneId, t.number)],
);

// ── work references (Tamtree owns the work) ────────────────────────────────
export const stage = pgEnum("stage", ["studio-script", "studio-narrate", "studio-clip", "studio-render"]);

export const runs = pgTable(
  "runs",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    sceneId: uuid("scene_id").references(() => scenes.id, { onDelete: "set null" }),
    takeId: uuid("take_id").references(() => takes.id, { onDelete: "set null" }),
    stage: stage("stage").notNull(),
    tamtreeRunId: text("tamtree_run_id").unique(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    /** Raw Tamtree status string; mapped for display by the state machine. */
    status: text("status").notNull().default("pending"),
    estimateUsd: usd("estimate_usd").notNull(),
    costUsd: usd("cost_usd"),
    meteredSteps: integer("metered_steps"),
    unpricedSteps: integer("unpriced_steps"),
    error: jsonb("error").$type<{ code: string; message: string } | null>(),
    lastEventSeq: integer("last_event_seq").notNull().default(0),
    input: jsonb("input").$type<Record<string, unknown>>().notNull(),
    output: jsonb("output").$type<Record<string, unknown> | null>(),
    confirmedBy: uuid("confirmed_by").references(() => members.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("runs_project").on(t.projectId), index("runs_status").on(t.status)],
);

export const changeRequests = pgTable("change_requests", {
  id: id(),
  sceneId: uuid("scene_id").notNull().references(() => scenes.id, { onDelete: "cascade" }),
  note: text("note").notNull(),
  sourceCommentId: uuid("source_comment_id"),
  /** revise-scene result: the new beat + which parts changed. */
  plan: jsonb("plan").$type<Record<string, unknown> | null>(),
  estimateUsd: usd("estimate_usd"),
  confirmedBy: uuid("confirmed_by").references(() => members.id),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdAt: createdAt(),
});

// ── review, versions ───────────────────────────────────────────────────────
export const projectVersions = pgTable(
  "project_versions",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    timeline: jsonb("timeline").$type<Record<string, unknown>>().notNull(),
    digest: text("digest").notNull(),
    renderAssetId: text("render_asset_id"),
    costUsd: usd("cost_usd"),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("versions_project_number").on(t.projectId, t.number)],
);

export const reviewLinks = pgTable("review_links", {
  id: id(),
  versionId: uuid("version_id").notNull().references(() => projectVersions.id, { onDelete: "cascade" }),
  /** Opaque, unguessable; the only credential a client holds. */
  token: text("token").notNull().unique(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const comments = pgTable("comments", {
  id: id(),
  versionId: uuid("version_id").notNull().references(() => projectVersions.id, { onDelete: "cascade" }),
  authorName: text("author_name").notNull(),
  timecodeS: real("timecode_s").notNull(),
  body: text("body").notNull(),
  resolvedByChangeRequestId: uuid("resolved_by_change_request_id").references(() => changeRequests.id),
  createdAt: createdAt(),
});

/** Bytes proxied from Tamtree into Tamshoot's object store (G1, Track W3). */
export const mediaCache = pgTable("media_cache", {
  assetId: text("asset_id").primaryKey(),
  objectKey: text("object_key").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: createdAt(),
});

export type Project = typeof projects.$inferSelect;
export type Scene = typeof scenes.$inferSelect;

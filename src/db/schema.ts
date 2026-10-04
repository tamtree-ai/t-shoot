/**
 * t-shoot's own document (02-architecture §4). Tamtree owns runs, assets, cost and
 * traces; this schema only *references* them (tamtree_run_id, asset ids) and caches
 * what the UI needs.
 *
 * v0 — frontend-first (Track F). Money is stored as numeric(12,6) USD, never float.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  type AnyPgColumn,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { StageFlow } from "@/lib/tamtree/stage-flows";
import type { StageKey } from "@/types/registry";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const usd = (name: string) => numeric(name, { precision: 12, scale: 6 });

// ── tenancy ────────────────────────────────────────────────────────────────
export const orgs = pgTable("orgs", {
  id: id(),
  name: text("name").notNull(),
  /** Optional Slack incoming webhook. Notifications post here only when a person turns Slack on. */
  slackWebhook: text("slack_webhook"),
  createdAt: createdAt(),
});

export const memberRole = pgEnum("member_role", ["owner", "editor", "client"]);

export const members = pgTable(
  "members",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    role: memberRole("role").notNull().default("editor"),
    notifyComment: boolean("notify_comment").notNull().default(true),
    notifyApproved: boolean("notify_approved").notNull().default(true),
    notifyFilm: boolean("notify_film").notNull().default(true),
    notifyLive: boolean("notify_live").notNull().default(true),
    notifySlack: boolean("notify_slack").notNull().default(false),
    /** Opt-in only. Recording consent does not clone a voice. */
    voiceCloneConsent: boolean("voice_clone_consent").notNull().default(false),
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
/** A project's production type (08-adr-production-types); the registry is `src/types/`. */
export const productionKind = pgEnum("production_kind", ["ai_clips", "stick_skit"]);

export const projectStep = pgEnum("project_step", ["brief", "script", "edit", "review", "export"]);

/** A named starting point for stick episodes: cast, set, voices, hashtags, spend cap. */
export const shows = pgTable("shows", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const projects = pgTable("projects", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  kind: productionKind("kind").notNull().default("ai_clips"),
  /** The type's catalog version when the project was created; its brief and draft are read against it. */
  catalogVersion: text("catalog_version"),
  step: projectStep("step").notNull().default("brief"),
  /** The type's config (its `configSchema`); for `ai_clips`: topic, length, tone, voice, look. */
  brief: jsonb("brief").$type<Record<string, unknown>>().notNull(),
  limitUsd: usd("limit_usd").notNull().default("5"),
  scriptApprovedAt: timestamp("script_approved_at", { withTimezone: true }),
  showId: uuid("show_id").references(() => shows.id, { onDelete: "set null" }),
  episodeNumber: integer("episode_number"),
  /** Hidden from the default library. Search and the Archived filter still find it. Opening it clears this. */
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  /** BCP-47-ish short code. `en` is the original. */
  language: text("language").notNull().default("en"),
  /** Set on a translation. The library shows language badges on the original. */
  sourceProjectId: uuid("source_project_id").references((): AnyPgColumn => projects.id, { onDelete: "set null" }),
  /** Who started it: person, paste, link, assistant, or draft-ahead. */
  origin: text("origin").notNull().default("person"),
  musicBed: text("music_bed"),
  /** 0–1, ducked under speech. */
  musicVolume: real("music_volume"),
  createdBy: uuid("created_by").references(() => members.id),
  lastTouchedBy: uuid("last_touched_by").references(() => members.id),
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
export const runs = pgTable(
  "runs",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    sceneId: uuid("scene_id").references(() => scenes.id, { onDelete: "set null" }),
    takeId: uuid("take_id").references(() => takes.id, { onDelete: "set null" }),
    /** The Tamtree flow key this run triggered (`studio-clip`, …): the driver's and the price history's key. */
    flow: text("flow").$type<StageFlow>().notNull(),
    /** The registry stage key (`clip`, `produce`, …). Validated by the registry, not the database. */
    stage: text("stage").$type<StageKey>().notNull(),
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
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  /** The scene an `ai_clips` change is about; null for a type with no scenes (a skit revise). */
  sceneId: uuid("scene_id").references(() => scenes.id, { onDelete: "cascade" }),
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
    kind: productionKind("kind").notNull().default("ai_clips"),
    /** TimelineV1 for `ai_clips`; `{ skit, render: { mp4, srt, txt, manifest } }` for `stick_skit`. */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
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
  /** Set when the commenter is a signed-in member. Anonymous review links leave this empty. */
  authorMemberId: uuid("author_member_id").references(() => members.id, { onDelete: "set null" }),
  timecodeS: real("timecode_s").notNull(),
  body: text("body").notNull(),
  resolvedByChangeRequestId: uuid("resolved_by_change_request_id").references(() => changeRequests.id),
  /** The owner closed it without asking the writer to rewrite. */
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** Bytes proxied from Tamtree into t-shoot's object store (G1, Track W3). */
export const mediaCache = pgTable("media_cache", {
  assetId: text("asset_id").primaryKey(),
  objectKey: text("object_key").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: createdAt(),
});

// ── production types ───────────────────────────────────────────────────────
/** An org's defaults for one production type, validated by its `tenantDefaultsSchema`. */
export const typeSettings = pgTable(
  "type_settings",
  {
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    kind: productionKind("kind").notNull(),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    updatedBy: uuid("updated_by").references(() => members.id),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.kind] })],
);

export const skitSource = pgEnum("skit_source", ["llm", "edited"]);

/** The `stick_skit` draft: one row per project, the document the human gate approves (09 §3). */
export const skitDrafts = pgTable("skit_drafts", {
  projectId: uuid("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }),
  skit: jsonb("skit").$type<Record<string, unknown>>().notNull(),
  premise: jsonb("premise").$type<Record<string, unknown> | null>(),
  lines: jsonb("lines").$type<Record<string, unknown>[]>().notNull().default([]),
  check: jsonb("check").$type<Record<string, unknown> | null>(),
  /** What the writer corrected on the way in (a mood clamped, a scene count forced). */
  warnings: jsonb("warnings").$type<string[]>().notNull().default([]),
  estimatedDurationS: real("estimated_duration_s"),
  catalogVersion: text("catalog_version").notNull(),
  digest: text("digest").notNull(),
  source: skitSource("source").notNull().default("llm"),
  /** One step of undo for "Ask for a change". */
  previousSkit: jsonb("previous_skit").$type<Record<string, unknown> | null>(),
  revisionNote: text("revision_note"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const publicationPlatform = pgEnum("publication_platform", ["youtube", "instagram", "tiktok"]);
export const publicationStatus = pgEnum("publication_status", ["draft", "confirmed"]);

/**
 * A post the owner has written for one platform. Confirming it does not upload:
 * the Tamtree connector that would send it is a later plugin.
 */
export const publications = pgTable(
  "publications",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    versionId: uuid("version_id").notNull().references(() => projectVersions.id, { onDelete: "cascade" }),
    platform: publicationPlatform("platform").notNull(),
    status: publicationStatus("status").notNull().default("draft"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    /** `live` once Tamtree's publish flow accepts it; `failed` when that send fails. Null until then. */
    delivery: text("delivery"),
    externalUrl: text("external_url"),
    result: text("result"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("publications_version_platform").on(t.versionId, t.platform)],
);

export const sessions = pgTable("sessions", {
  id: id(),
  memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const magicLinks = pgTable("magic_links", {
  id: id(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const invites = pgTable("invites", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: memberRole("role").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  invitedBy: uuid("invited_by").references(() => members.id, { onDelete: "set null" }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** One playlist link per client. */
export const clientPortals = pgTable(
  "client_portals",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("client_portals_member").on(t.memberId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").references(() => members.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    href: text("href").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_member").on(t.memberId, t.createdAt)],
);

export const mailOutbox = pgTable("mail_outbox", {
  id: id(),
  toEmail: text("to_email").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

export const showIdeas = pgTable(
  "show_ideas",
  {
    id: id(),
    showId: uuid("show_id").notNull().references(() => shows.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    position: integer("position").notNull(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("show_ideas_show_position").on(t.showId, t.position)],
);

/** A workspace character: a catalog body plus a name, look notes, and a personality line. */
export const customCharacters = pgTable("custom_characters", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  body: text("body").notNull(),
  color: text("color").notNull(),
  hair: text("hair").notNull().default(""),
  accessory: text("accessory").notNull().default(""),
  personality: text("personality").notNull().default(""),
  createdAt: createdAt(),
});

export const apiTokens = pgTable("api_tokens", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  /** Last four characters, so Settings can show which token this is. */
  tokenHint: text("token_hint").notNull(),
  dailyCapUsd: usd("daily_cap_usd").notNull().default("1"),
  spentUsd: usd("spent_usd").notNull().default("0"),
  spentOn: text("spent_on").notNull().default(""),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** A short writer call (topics, hooks, titles, translation) and what it cost. */
export const writerJobs = pgTable("writer_jobs", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  memberId: uuid("member_id").references(() => members.id, { onDelete: "set null" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  estimateUsd: usd("estimate_usd").notNull(),
  costUsd: usd("cost_usd"),
  input: jsonb("input").$type<Record<string, unknown>>().notNull(),
  output: jsonb("output").$type<Record<string, unknown> | null>(),
  createdAt: createdAt(),
});

export const postStats = pgTable("post_stats", {
  publicationId: uuid("publication_id").primaryKey().references(() => publications.id, { onDelete: "cascade" }),
  views: integer("views").notNull().default(0),
  averageWatchS: real("average_watch_s").notNull().default(0),
  averagePercent: real("average_percent").notNull().default(0),
  likes: integer("likes").notNull().default(0),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One row per publication per day, for the 30-day sparkline. */
export const postStatDays = pgTable(
  "post_stat_days",
  {
    id: id(),
    publicationId: uuid("publication_id").notNull().references(() => publications.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    views: integer("views").notNull().default(0),
    averagePercent: real("average_percent").notNull().default(0),
  },
  (t) => [uniqueIndex("post_stat_days_pub_day").on(t.publicationId, t.day)],
);

// ── Studio Review (planning/2026-10-04-asset-review-interface) ─────────────────
// Client → Project → Asset → Variation → Version, shared by link + passcode. Its own tables:
// the `review_links` / `comments` above stay with the short-video review at /r.

export const studioRoomTheme = pgEnum("studio_room_theme", ["light", "dark", "auto"]);
export const studioProjectStatus = pgEnum("studio_project_status", ["active", "paused", "delivered"]);
export const studioAssetKind = pgEnum("studio_asset_kind", ["image", "video"]);
export const studioVersionStatus = pgEnum("studio_version_status", ["in_review", "changes_requested", "approved"]);
export const studioProcessing = pgEnum("studio_processing", ["pending", "ready", "failed"]);
export const studioDownloadPolicy = pgEnum("studio_download_policy", ["none", "after_approval", "always"]);
export const studioVersionMode = pgEnum("studio_version_mode", ["latest", "pinned"]);
export const studioDecisionKind = pgEnum("studio_decision", ["approved", "changes_requested"]);

/** One uploaded file and its derived renditions. Keys are BlobStore keys; null until processed. */
export const studioFiles = pgTable(
  "studio_files",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    originalKey: text("original_key").notNull(),
    originalName: text("original_name").notNull(),
    mime: text("mime").notNull(),
    bytes: bigint("bytes", { mode: "number" }).notNull(),
    /** Hex SHA-256 of the original, computed while it streams in. A sign-off records it. */
    sha256: text("sha256").notNull(),
    width: integer("width"),
    height: integer("height"),
    durationS: real("duration_s"),
    /** Frame rate as ffprobe reports it (30000/1001 stays exact). */
    fpsNum: integer("fps_num"),
    fpsDen: integer("fps_den"),
    previewKey: text("preview_key"),
    thumbKey: text("thumb_key"),
    posterKey: text("poster_key"),
    wmPreviewKey: text("wm_preview_key"),
    processing: studioProcessing("processing").notNull().default("pending"),
    /** Plain English, shown to the owner when processing fails. */
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("studio_files_org").on(t.orgId)],
);

export const studioBrand = pgTable("studio_brand", {
  orgId: uuid("org_id").primaryKey().references(() => orgs.id, { onDelete: "cascade" }),
  studioName: text("studio_name").notNull(),
  logoFileId: uuid("logo_file_id").references(() => studioFiles.id, { onDelete: "set null" }),
  accentHex: text("accent_hex").notNull().default("#1f6feb"),
  roomTheme: studioRoomTheme("room_theme").notNull().default("light"),
  emailFooter: text("email_footer").notNull().default(""),
  website: text("website"),
  supportEmail: text("support_email"),
  updatedAt: updatedAt(),
});

export const studioClients = pgTable(
  "studio_clients",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    company: text("company"),
    contacts: jsonb("contacts").$type<{ name: string; email: string; role?: string }[]>().notNull().default([]),
    notes: text("notes").notNull().default(""),
    logoFileId: uuid("logo_file_id").references(() => studioFiles.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("studio_clients_org").on(t.orgId)],
);

export const studioProjects = pgTable(
  "studio_projects",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => studioClients.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    dueDate: text("due_date"),
    roundsIncluded: integer("rounds_included").notNull().default(2),
    status: studioProjectStatus("status").notNull().default("active"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("studio_projects_org").on(t.orgId), index("studio_projects_client").on(t.clientId)],
);

export const studioAssets = pgTable(
  "studio_assets",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => studioProjects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: studioAssetKind("kind").notNull(),
    sort: integer("sort").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("studio_assets_project").on(t.projectId)],
);

/** A parallel design direction ("Option A"). Every asset has at least "Main". */
export const studioVariations = pgTable(
  "studio_variations",
  {
    id: id(),
    assetId: uuid("asset_id").notNull().references(() => studioAssets.id, { onDelete: "cascade" }),
    label: text("label").notNull().default("Main"),
    sort: integer("sort").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("studio_variations_asset").on(t.assetId)],
);

/** One iteration of a variation. Comments, decisions and compare all belong here. */
export const studioVersions = pgTable(
  "studio_versions",
  {
    id: id(),
    variationId: uuid("variation_id").notNull().references(() => studioVariations.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    fileId: uuid("file_id").notNull().references(() => studioFiles.id),
    changeNote: text("change_note").notNull().default(""),
    status: studioVersionStatus("status").notNull().default("in_review"),
    createdBy: uuid("created_by").references(() => members.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("studio_versions_variation_number").on(t.variationId, t.number)],
);

/**
 * A review link. The URL token is stored twice: hashed for lookup, and AES-GCM encrypted
 * (STUDIO_SECRET) so the owner can copy the link again. The passcode is encrypted, never hashed,
 * for the same reason.
 */
export const studioShares = pgTable(
  "studio_shares",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => studioProjects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    message: text("message").notNull().default(""),
    notes: jsonb("notes").$type<string[]>().notNull().default([]),
    tokenHash: text("token_hash").notNull().unique(),
    tokenEnc: text("token_enc").notNull(),
    passcodeEnc: text("passcode_enc").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    downloadPolicy: studioDownloadPolicy("download_policy").notNull().default("after_approval"),
    watermark: boolean("watermark").notNull().default(true),
    commentsOpen: boolean("comments_open").notNull().default(true),
    versionMode: studioVersionMode("version_mode").notNull().default("latest"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => members.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("studio_shares_project").on(t.projectId)],
);

export const studioShareItems = pgTable(
  "studio_share_items",
  {
    shareId: uuid("share_id").notNull().references(() => studioShares.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").notNull().references(() => studioAssets.id, { onDelete: "cascade" }),
    sort: integer("sort").notNull().default(0),
    /** Used when the share's version_mode is `pinned`. */
    pinnedVersionIds: jsonb("pinned_version_ids").$type<string[]>().notNull().default([]),
  },
  (t) => [primaryKey({ columns: [t.shareId, t.assetId] })],
);

/** A guest who opened a share and gave a name and email. Email is stored lower-case. */
export const studioReviewers = pgTable(
  "studio_reviewers",
  {
    id: id(),
    shareId: uuid("share_id").notNull().references(() => studioShares.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    notify: boolean("notify").notNull().default(true),
    unsubTokenHash: text("unsub_token_hash").unique(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("studio_reviewers_share_email").on(t.shareId, t.email)],
);

export const studioShareSessions = pgTable(
  "studio_share_sessions",
  {
    id: id(),
    shareId: uuid("share_id").notNull().references(() => studioShares.id, { onDelete: "cascade" }),
    /** Null between the passcode gate and the identity step. */
    reviewerId: uuid("reviewer_id").references(() => studioReviewers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    ip: text("ip"),
    ua: text("ua"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("studio_share_sessions_share").on(t.shareId)],
);

/**
 * Two levels: a root (numbered per version, may carry an annotation) and replies to it.
 * `quoteId` points at another reply in the same thread ("replying to Sam: …").
 */
export const studioComments = pgTable(
  "studio_comments",
  {
    id: id(),
    versionId: uuid("version_id").notNull().references(() => studioVersions.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => studioComments.id, { onDelete: "cascade" }),
    quoteId: uuid("quote_id").references((): AnyPgColumn => studioComments.id, { onDelete: "set null" }),
    /** Roots only: #n on the canvas and in the rail. */
    number: integer("number"),
    authorMemberId: uuid("author_member_id").references(() => members.id, { onDelete: "set null" }),
    authorReviewerId: uuid("author_reviewer_id").references(() => studioReviewers.id, { onDelete: "set null" }),
    /** The name shown, kept so a deleted author still reads correctly. */
    authorLabel: text("author_label").notNull(),
    body: text("body").notNull(),
    /** `{v:1, shape, x, y, w?, h?, t?, tEnd?, frame?}`, normalised 0..1 (src/lib/studio/annotation.ts). */
    annotation: jsonb("annotation").$type<Record<string, unknown> | null>(),
    /** Owner and editor only; never sent to the review room. */
    internal: boolean("internal").notNull().default(false),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByLabel: text("resolved_by_label"),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("studio_comments_version").on(t.versionId, t.createdAt),
    index("studio_comments_parent").on(t.parentId),
    uniqueIndex("studio_comments_version_number").on(t.versionId, t.number).where(sql`${t.parentId} is null`),
    check("studio_comments_reply_shape", sql`${t.parentId} is null or (${t.number} is null and ${t.annotation} is null)`),
    check("studio_comments_root_numbered", sql`${t.parentId} is not null or ${t.number} is not null`),
    check("studio_comments_quote_needs_parent", sql`${t.quoteId} is null or ${t.parentId} is not null`),
  ],
);

/** Sign-off record. Append-only: a trigger in 0009 refuses UPDATE. */
export const studioDecisions = pgTable(
  "studio_decisions",
  {
    id: id(),
    versionId: uuid("version_id").notNull().references(() => studioVersions.id, { onDelete: "cascade" }),
    reviewerId: uuid("reviewer_id").references(() => studioReviewers.id, { onDelete: "set null" }),
    decision: studioDecisionKind("decision").notNull(),
    signedName: text("signed_name").notNull(),
    email: text("email").notNull(),
    ip: text("ip"),
    ua: text("ua"),
    fileSha256: text("file_sha256").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("studio_decisions_version").on(t.versionId, t.createdAt)],
);

/** Activity log, and the source the notifier batches from. */
export const studioEvents = pgTable(
  "studio_events",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => studioProjects.id, { onDelete: "cascade" }),
    shareId: uuid("share_id").references(() => studioShares.id, { onDelete: "set null" }),
    actorLabel: text("actor_label").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    /** Set once studio.notify has mailed it. */
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("studio_events_project").on(t.projectId, t.createdAt), index("studio_events_share").on(t.shareId, t.createdAt)],
);

/** Fixed-window counters for the gate, comment posting and identity creation. */
export const studioRateLimits = pgTable(
  "studio_rate_limits",
  {
    bucket: text("bucket").notNull(),
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.bucket, t.key, t.windowStart] })],
);

export type Project = typeof projects.$inferSelect;
export type Scene = typeof scenes.$inferSelect;
export type RunRecord = typeof runs.$inferSelect;

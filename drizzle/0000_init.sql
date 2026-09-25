CREATE TYPE "public"."member_role" AS ENUM('owner', 'editor');--> statement-breakpoint
CREATE TYPE "public"."project_step" AS ENUM('brief', 'script', 'edit', 'review', 'export');--> statement-breakpoint
CREATE TYPE "public"."stage" AS ENUM('studio-script', 'studio-narrate', 'studio-clip', 'studio-render');--> statement-breakpoint
CREATE TABLE "change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" uuid NOT NULL,
	"note" text NOT NULL,
	"source_comment_id" uuid,
	"plan" jsonb,
	"estimate_usd" numeric(12, 6),
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"author_name" text NOT NULL,
	"timecode_s" real NOT NULL,
	"body" text NOT NULL,
	"resolved_by_change_request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_cache" (
	"asset_id" text PRIMARY KEY NOT NULL,
	"object_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" "member_role" DEFAULT 'editor' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orgs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"timeline" jsonb NOT NULL,
	"digest" text NOT NULL,
	"render_asset_id" text,
	"cost_usd" numeric(12, 6),
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"step" "project_step" DEFAULT 'brief' NOT NULL,
	"brief" jsonb NOT NULL,
	"voice" text NOT NULL,
	"limit_usd" numeric(12, 6) DEFAULT '5' NOT NULL,
	"script_approved_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"token" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"scene_id" uuid,
	"take_id" uuid,
	"stage" "stage" NOT NULL,
	"tamtree_run_id" text,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"estimate_usd" numeric(12, 6) NOT NULL,
	"cost_usd" numeric(12, 6),
	"metered_steps" integer,
	"unpriced_steps" integer,
	"error" jsonb,
	"last_event_seq" integer DEFAULT 0 NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"confirmed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "runs_tamtree_run_id_unique" UNIQUE("tamtree_run_id"),
	CONSTRAINT "runs_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"narration" text NOT NULL,
	"visual_prompt" text NOT NULL,
	"narration_asset_id" text,
	"narration_duration_s" real,
	"phrases" jsonb,
	"voice_out_of_date" boolean DEFAULT false NOT NULL,
	"chosen_take_id" uuid,
	"trim_start_s" real DEFAULT 0 NOT NULL,
	"trim_end_s" real,
	"caption_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dropped_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "takes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"visual_prompt" text NOT NULL,
	"clip_asset_id" text,
	"duration_s" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tamtree_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"base_url" text NOT NULL,
	"api_key_ciphertext" text NOT NULL,
	"flow_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tamtree_connections_org_id_unique" UNIQUE("org_id")
);
--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_confirmed_by_members_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_version_id_project_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."project_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_resolved_by_change_request_id_change_requests_id_fk" FOREIGN KEY ("resolved_by_change_request_id") REFERENCES "public"."change_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_versions" ADD CONSTRAINT "project_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_links" ADD CONSTRAINT "review_links_version_id_project_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."project_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_take_id_takes_id_fk" FOREIGN KEY ("take_id") REFERENCES "public"."takes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_confirmed_by_members_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takes" ADD CONSTRAINT "takes_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tamtree_connections" ADD CONSTRAINT "tamtree_connections_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "members_org_email" ON "members" USING btree ("org_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "versions_project_number" ON "project_versions" USING btree ("project_id","number");--> statement-breakpoint
CREATE INDEX "runs_project" ON "runs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "runs_status" ON "runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "scenes_project_position" ON "scenes" USING btree ("project_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "takes_scene_number" ON "takes" USING btree ("scene_id","number");
CREATE TYPE "public"."production_kind" AS ENUM('ai_clips', 'stick_skit');--> statement-breakpoint
CREATE TYPE "public"."skit_source" AS ENUM('llm', 'edited');--> statement-breakpoint
CREATE TABLE "skit_drafts" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"skit" jsonb NOT NULL,
	"premise" jsonb,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"check" jsonb,
	"estimated_duration_s" real,
	"catalog_version" text NOT NULL,
	"digest" text NOT NULL,
	"source" "skit_source" DEFAULT 'llm' NOT NULL,
	"previous_skit" jsonb,
	"revision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "type_settings" (
	"org_id" uuid NOT NULL,
	"kind" "production_kind" NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "type_settings_org_id_kind_pk" PRIMARY KEY("org_id","kind")
);
--> statement-breakpoint
ALTER TABLE "runs" ALTER COLUMN "stage" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "project_versions" ADD COLUMN "kind" "production_kind" DEFAULT 'ai_clips' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_versions" ADD COLUMN "payload" jsonb;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "kind" "production_kind" DEFAULT 'ai_clips' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "catalog_version" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "flow" text;--> statement-breakpoint
ALTER TABLE "skit_drafts" ADD CONSTRAINT "skit_drafts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "type_settings" ADD CONSTRAINT "type_settings_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "type_settings" ADD CONSTRAINT "type_settings_updated_by_members_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Backfill (hand-written; 09 §3). The voice column is authoritative: changeVoice wrote it, not brief.voice.
UPDATE "projects" SET "brief" = "brief" || jsonb_build_object('voice', "voice");--> statement-breakpoint
UPDATE "projects" SET "catalog_version" = '1' WHERE "kind" = 'ai_clips' AND "catalog_version" IS NULL;--> statement-breakpoint
UPDATE "runs" SET "flow" = "stage", "stage" = CASE "stage"
	WHEN 'studio-script' THEN 'script'
	WHEN 'studio-narrate' THEN 'narrate'
	WHEN 'studio-clip' THEN 'clip'
	WHEN 'studio-render' THEN 'render'
	ELSE "stage" END
WHERE "flow" IS NULL;--> statement-breakpoint
UPDATE "project_versions" SET "payload" = "timeline" WHERE "payload" IS NULL;

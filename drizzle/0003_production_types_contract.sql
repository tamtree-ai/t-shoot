ALTER TABLE "project_versions" ALTER COLUMN "payload" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ALTER COLUMN "flow" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "project_versions" DROP COLUMN "timeline";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "voice";--> statement-breakpoint
DROP TYPE "public"."stage";
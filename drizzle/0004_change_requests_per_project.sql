-- A change belongs to a project; the scene is optional, since a stick skit has none (K5).
-- Expand: add the column nullable, backfill from each change's scene, then require it.
ALTER TABLE "change_requests" ADD COLUMN "project_id" uuid;--> statement-breakpoint
UPDATE "change_requests" AS c SET "project_id" = s."project_id" FROM "scenes" AS s WHERE s."id" = c."scene_id";--> statement-breakpoint
ALTER TABLE "change_requests" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "change_requests" ALTER COLUMN "scene_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;

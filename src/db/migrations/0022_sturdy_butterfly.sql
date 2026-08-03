ALTER TABLE "database_clusters" ADD COLUMN "code" varchar(80);--> statement-breakpoint
ALTER TABLE "database_clusters" ADD COLUMN "engine_version" varchar(40);--> statement-breakpoint
ALTER TABLE "database_clusters" ADD COLUMN "project_uuid" varchar(255);--> statement-breakpoint
ALTER TABLE "database_clusters" ADD COLUMN "environment_name" varchar(120);--> statement-breakpoint
ALTER TABLE "database_clusters" ADD COLUMN "limits_memory" varchar(40);--> statement-breakpoint
ALTER TABLE "database_clusters" ADD COLUMN "limits_cpus" varchar(40);--> statement-breakpoint
ALTER TABLE "database_clusters" ADD COLUMN "backup_configuration_uuid" varchar(255);--> statement-breakpoint
ALTER TABLE "database_clusters" ADD COLUMN "backup_status" varchar(40);--> statement-breakpoint
ALTER TABLE "database_clusters" ADD COLUMN "last_health_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "database_clusters" ADD COLUMN "last_health_error" text;--> statement-breakpoint
ALTER TABLE "database_clusters" ADD COLUMN "credentials_rotated_at" timestamp with time zone;--> statement-breakpoint
UPDATE "database_clusters" SET "code" = 'legacy-' || substr(replace("id"::text, '-', ''), 1, 12), "engine_version" = CASE WHEN "engine" = 'postgresql' THEN '18.4' ELSE '8.0.46' END, "project_uuid" = 'unassigned', "environment_name" = 'production' WHERE "code" IS NULL;--> statement-breakpoint
ALTER TABLE "database_clusters" ALTER COLUMN "code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "database_clusters" ALTER COLUMN "engine_version" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "database_clusters" ALTER COLUMN "project_uuid" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "database_clusters" ALTER COLUMN "environment_name" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "database_clusters_code_active_unique" ON "database_clusters" USING btree ("code") WHERE "database_clusters"."deleted_at" IS NULL;

CREATE TYPE "public"."application_cron_sync_status" AS ENUM('pending', 'synchronized', 'failed');--> statement-breakpoint
CREATE TABLE "application_cron_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"application_build_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"command" text NOT NULL,
	"frequency" varchar(100) NOT NULL,
	"timeout_seconds" integer DEFAULT 300 NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"provider_task_uuid" varchar(255),
	"sync_status" "application_cron_sync_status" DEFAULT 'pending' NOT NULL,
	"last_synchronized_at" timestamp with time zone,
	"last_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500),
	CONSTRAINT "application_cron_jobs_timeout_check" CHECK ("application_cron_jobs"."timeout_seconds" BETWEEN 1 AND 3600)
);
--> statement-breakpoint
ALTER TABLE "application_cron_jobs" ADD CONSTRAINT "application_cron_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_cron_jobs" ADD CONSTRAINT "application_cron_jobs_application_build_id_application_builds_id_fk" FOREIGN KEY ("application_build_id") REFERENCES "public"."application_builds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "application_cron_jobs_name_active_unique" ON "application_cron_jobs" USING btree ("application_build_id","name") WHERE "application_cron_jobs"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "application_cron_jobs_provider_uuid_active_unique" ON "application_cron_jobs" USING btree ("provider_task_uuid") WHERE "application_cron_jobs"."provider_task_uuid" IS NOT NULL AND "application_cron_jobs"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "application_cron_jobs_application_enabled_idx" ON "application_cron_jobs" USING btree ("application_build_id","is_enabled");
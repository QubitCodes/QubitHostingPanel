CREATE TYPE "public"."database_backup_storage" AS ENUM('local', 's3');--> statement-breakpoint
CREATE TYPE "public"."database_backup_trigger" AS ENUM('manual', 'scheduled');--> statement-breakpoint
CREATE TYPE "public"."database_backup_verification_status" AS ENUM('not_started', 'running', 'verified', 'failed');--> statement-breakpoint
CREATE TABLE "database_backup_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"logical_database_id" uuid NOT NULL,
	"frequency_hours" integer NOT NULL,
	"retention_days" integer NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_run_status" varchar(40),
	"last_failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500),
	CONSTRAINT "database_backup_schedules_frequency_check" CHECK ("database_backup_schedules"."frequency_hours" BETWEEN 1 AND 8760),
	CONSTRAINT "database_backup_schedules_retention_check" CHECK ("database_backup_schedules"."retention_days" BETWEEN 1 AND 3650)
);
--> statement-breakpoint
ALTER TABLE "database_backups" ADD COLUMN "trigger" "database_backup_trigger" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "database_backups" ADD COLUMN "storage_provider" "database_backup_storage" DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE "database_backups" ADD COLUMN "verification_status" "database_backup_verification_status" DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "database_backups" ADD COLUMN "verification_failure_reason" text;--> statement-breakpoint
ALTER TABLE "database_backups" ADD COLUMN "last_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "database_backup_schedules" ADD CONSTRAINT "database_backup_schedules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_backup_schedules" ADD CONSTRAINT "database_backup_schedules_logical_database_id_logical_databases_id_fk" FOREIGN KEY ("logical_database_id") REFERENCES "public"."logical_databases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "database_backup_schedules_database_active_unique" ON "database_backup_schedules" USING btree ("logical_database_id") WHERE "database_backup_schedules"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "database_backup_schedules_due_idx" ON "database_backup_schedules" USING btree ("is_enabled","next_run_at");
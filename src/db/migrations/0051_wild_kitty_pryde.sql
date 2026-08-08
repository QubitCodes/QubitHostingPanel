CREATE TYPE "public"."database_transfer_direction" AS ENUM('import', 'export');--> statement-breakpoint
CREATE TYPE "public"."database_transfer_format" AS ENUM('native', 'csv', 'json');--> statement-breakpoint
CREATE TYPE "public"."database_transfer_scope" AS ENUM('database', 'table');--> statement-breakpoint
CREATE TYPE "public"."database_transfer_status" AS ENUM('queued', 'running', 'cancel_requested', 'cancelled', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "database_transfer_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"logical_database_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"direction" "database_transfer_direction" NOT NULL,
	"format" "database_transfer_format" NOT NULL,
	"scope" "database_transfer_scope" NOT NULL,
	"status" "database_transfer_status" DEFAULT 'queued' NOT NULL,
	"mode" varchar(20),
	"schema_name" varchar(128),
	"table_name" varchar(128),
	"source_ciphertext" text,
	"output_storage_key" varchar(500),
	"output_name" varchar(255),
	"output_checksum_sha256" varchar(64),
	"output_size_bytes" integer,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"processed_rows" integer DEFAULT 0 NOT NULL,
	"total_rows" integer,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"maximum_attempts" integer DEFAULT 3 NOT NULL,
	"pre_import_backup_id" uuid,
	"failure_reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500),
	CONSTRAINT "database_transfer_jobs_progress_check" CHECK ("database_transfer_jobs"."progress_percent" BETWEEN 0 AND 100),
	CONSTRAINT "database_transfer_jobs_rows_check" CHECK ("database_transfer_jobs"."processed_rows" >= 0 AND ("database_transfer_jobs"."total_rows" IS NULL OR "database_transfer_jobs"."total_rows" >= 0)),
	CONSTRAINT "database_transfer_jobs_attempts_check" CHECK ("database_transfer_jobs"."attempt_count" >= 0 AND "database_transfer_jobs"."maximum_attempts" BETWEEN 1 AND 10)
);
--> statement-breakpoint
ALTER TABLE "database_transfer_jobs" ADD CONSTRAINT "database_transfer_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_transfer_jobs" ADD CONSTRAINT "database_transfer_jobs_logical_database_id_logical_databases_id_fk" FOREIGN KEY ("logical_database_id") REFERENCES "public"."logical_databases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_transfer_jobs" ADD CONSTRAINT "database_transfer_jobs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_transfer_jobs" ADD CONSTRAINT "database_transfer_jobs_pre_import_backup_id_database_backups_id_fk" FOREIGN KEY ("pre_import_backup_id") REFERENCES "public"."database_backups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "database_transfer_jobs_database_created_idx" ON "database_transfer_jobs" USING btree ("logical_database_id","created_at");--> statement-breakpoint
CREATE INDEX "database_transfer_jobs_status_created_idx" ON "database_transfer_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "database_transfer_jobs_expiry_idx" ON "database_transfer_jobs" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "database_transfer_jobs_active_database_unique" ON "database_transfer_jobs" USING btree ("logical_database_id") WHERE "database_transfer_jobs"."status" IN ('queued', 'running', 'cancel_requested') AND "database_transfer_jobs"."deleted_at" IS NULL;
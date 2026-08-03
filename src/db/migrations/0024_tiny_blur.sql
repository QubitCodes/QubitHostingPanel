CREATE TYPE "public"."database_backup_status" AS ENUM('queued', 'running', 'completed', 'failed', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."database_restore_status" AS ENUM('not_started', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "database_backups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"logical_database_id" uuid NOT NULL,
	"status" "database_backup_status" DEFAULT 'queued' NOT NULL,
	"restore_status" "database_restore_status" DEFAULT 'not_started' NOT NULL,
	"storage_key" varchar(500),
	"checksum_sha256" varchar(64),
	"size_bytes" bigint,
	"failure_reason" text,
	"restore_failure_reason" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_restore_started_at" timestamp with time zone,
	"last_restored_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500),
	CONSTRAINT "database_backups_size_check" CHECK ("database_backups"."size_bytes" IS NULL OR "database_backups"."size_bytes" >= 0),
	CONSTRAINT "database_backups_completion_check" CHECK ("database_backups"."completed_at" IS NULL OR "database_backups"."started_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "database_backups" ADD CONSTRAINT "database_backups_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_backups" ADD CONSTRAINT "database_backups_logical_database_id_logical_databases_id_fk" FOREIGN KEY ("logical_database_id") REFERENCES "public"."logical_databases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "database_backups_workspace_database_created_idx" ON "database_backups" USING btree ("workspace_id","logical_database_id","created_at");--> statement-breakpoint
CREATE INDEX "database_backups_status_expires_idx" ON "database_backups" USING btree ("status","expires_at");

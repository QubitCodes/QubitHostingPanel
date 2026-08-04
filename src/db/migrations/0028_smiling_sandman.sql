CREATE TYPE "public"."provider_connection_status" AS ENUM('active', 'disabled', 'unhealthy');--> statement-breakpoint
CREATE TYPE "public"."provider_import_kind" AS ENUM('server', 'application', 'database', 'service', 'deployment');--> statement-breakpoint
CREATE TYPE "public"."provider_reconciliation_status" AS ENUM('running', 'succeeded', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."provider_token_status" AS ENUM('active', 'retired', 'revoked');--> statement-breakpoint
CREATE TABLE "provider_connection_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"token_ciphertext" text NOT NULL,
	"token_fingerprint" varchar(64) NOT NULL,
	"token_suffix" varchar(12) NOT NULL,
	"status" "provider_token_status" DEFAULT 'active' NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "provider_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(120) NOT NULL,
	"name" varchar(160) NOT NULL,
	"provider" varchar(40) DEFAULT 'coolify' NOT NULL,
	"base_url" varchar(500) NOT NULL,
	"team_id" integer,
	"server_uuid" varchar(120),
	"destination_uuid" varchar(120),
	"default_project_uuid" varchar(120),
	"default_environment_name" varchar(120) DEFAULT 'production' NOT NULL,
	"wildcard_domain" varchar(255),
	"status" "provider_connection_status" DEFAULT 'active' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"last_validated_at" timestamp with time zone,
	"last_healthy_at" timestamp with time zone,
	"last_error" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "provider_imported_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"kind" "provider_import_kind" NOT NULL,
	"provider_resource_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"status" varchar(120),
	"payload_hash" varchar(64) NOT NULL,
	"snapshot" jsonb NOT NULL,
	"matched_workspace_resource_id" uuid,
	"first_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"missing_since" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "provider_reconciliation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"status" "provider_reconciliation_status" DEFAULT 'running' NOT NULL,
	"imported_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"failure_details" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
ALTER TABLE "provider_connection_tokens" ADD CONSTRAINT "provider_connection_tokens_connection_id_provider_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."provider_connections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_connection_tokens" ADD CONSTRAINT "provider_connection_tokens_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_imported_resources" ADD CONSTRAINT "provider_imported_resources_connection_id_provider_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."provider_connections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_imported_resources" ADD CONSTRAINT "provider_imported_resources_matched_workspace_resource_id_workspace_resources_id_fk" FOREIGN KEY ("matched_workspace_resource_id") REFERENCES "public"."workspace_resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_reconciliation_runs" ADD CONSTRAINT "provider_reconciliation_runs_connection_id_provider_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."provider_connections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_connection_tokens_version_unique" ON "provider_connection_tokens" USING btree ("connection_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_connection_tokens_active_unique" ON "provider_connection_tokens" USING btree ("connection_id") WHERE "provider_connection_tokens"."status" = 'active' AND "provider_connection_tokens"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "provider_connection_tokens_fingerprint_idx" ON "provider_connection_tokens" USING btree ("token_fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_connections_code_unique" ON "provider_connections" USING btree ("code") WHERE "provider_connections"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_connections_default_unique" ON "provider_connections" USING btree ("provider") WHERE "provider_connections"."is_default" = true AND "provider_connections"."status" = 'active' AND "provider_connections"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "provider_connections_status_idx" ON "provider_connections" USING btree ("provider","status");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_imported_resources_identity_unique" ON "provider_imported_resources" USING btree ("connection_id","kind","provider_resource_id") WHERE "provider_imported_resources"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "provider_imported_resources_observed_idx" ON "provider_imported_resources" USING btree ("connection_id","kind","last_observed_at");--> statement-breakpoint
CREATE INDEX "provider_imported_resources_match_idx" ON "provider_imported_resources" USING btree ("matched_workspace_resource_id");--> statement-breakpoint
CREATE INDEX "provider_reconciliation_runs_connection_idx" ON "provider_reconciliation_runs" USING btree ("connection_id","started_at");
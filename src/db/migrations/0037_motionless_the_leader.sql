CREATE TYPE "public"."application_environment" AS ENUM('development', 'testing', 'staging', 'production');--> statement-breakpoint
CREATE TABLE "workspace_github_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"installation_id" varchar(40) NOT NULL,
	"coolify_github_app_uuid" varchar(120),
	"account_login" varchar(255) NOT NULL,
	"account_name" varchar(255),
	"account_type" varchar(40) NOT NULL,
	"avatar_url" varchar(500),
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "reserved_domain_labels" jsonb DEFAULT '["admin","api","assets","billing","cdn","dashboard","ftp","internal","mail","panel","smtp","status","support","www"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "blocked_domain_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "application_builds" ADD COLUMN "deployment_environment" "application_environment" DEFAULT 'production' NOT NULL;--> statement-breakpoint
ALTER TABLE "application_builds" ADD COLUMN "framework" varchar(80);--> statement-breakpoint
ALTER TABLE "application_builds" ADD COLUMN "environment_variables_ciphertext" text;--> statement-breakpoint
ALTER TABLE "workspace_github_connections" ADD CONSTRAINT "workspace_github_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_github_connections" ADD CONSTRAINT "workspace_github_connections_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_github_connections_installation_active_unique" ON "workspace_github_connections" USING btree ("installation_id") WHERE "workspace_github_connections"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "workspace_github_connections_workspace_status_idx" ON "workspace_github_connections" USING btree ("workspace_id","status");
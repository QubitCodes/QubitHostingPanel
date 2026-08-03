CREATE TYPE "public"."application_deployment_status" AS ENUM('queued', 'deploying', 'running', 'failed', 'stopped');--> statement-breakpoint
CREATE TABLE "application_database_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_build_id" uuid NOT NULL,
	"logical_database_id" uuid NOT NULL,
	"environment_prefix" varchar(40) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "application_deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"application_build_id" uuid NOT NULL,
	"resource_id" uuid,
	"status" "application_deployment_status" DEFAULT 'queued' NOT NULL,
	"provider_deployment_id" varchar(255),
	"public_url" varchar(500),
	"failure_reason" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
ALTER TABLE "application_builds" ADD COLUMN "install_command" varchar(500);--> statement-breakpoint
ALTER TABLE "application_builds" ADD COLUMN "build_command" varchar(500);--> statement-breakpoint
ALTER TABLE "application_builds" ADD COLUMN "start_command" varchar(500);--> statement-breakpoint
ALTER TABLE "application_builds" ADD COLUMN "base_directory" varchar(500) DEFAULT '/' NOT NULL;--> statement-breakpoint
ALTER TABLE "application_builds" ADD COLUMN "publish_directory" varchar(500);--> statement-breakpoint
ALTER TABLE "application_builds" ADD COLUMN "application_port" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "application_builds" ADD COLUMN "requested_domain" varchar(255);--> statement-breakpoint
ALTER TABLE "application_database_bindings" ADD CONSTRAINT "application_database_bindings_application_build_id_application_builds_id_fk" FOREIGN KEY ("application_build_id") REFERENCES "public"."application_builds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_database_bindings" ADD CONSTRAINT "application_database_bindings_logical_database_id_logical_databases_id_fk" FOREIGN KEY ("logical_database_id") REFERENCES "public"."logical_databases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_deployments" ADD CONSTRAINT "application_deployments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_deployments" ADD CONSTRAINT "application_deployments_application_build_id_application_builds_id_fk" FOREIGN KEY ("application_build_id") REFERENCES "public"."application_builds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_deployments" ADD CONSTRAINT "application_deployments_resource_id_workspace_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."workspace_resources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "application_database_bindings_active_unique" ON "application_database_bindings" USING btree ("application_build_id","logical_database_id") WHERE "application_database_bindings"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "application_database_bindings_prefix_active_unique" ON "application_database_bindings" USING btree ("application_build_id","environment_prefix") WHERE "application_database_bindings"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "application_deployments_workspace_status_idx" ON "application_deployments" USING btree ("workspace_id","status","created_at");--> statement-breakpoint
CREATE INDEX "application_deployments_build_created_idx" ON "application_deployments" USING btree ("application_build_id","created_at");--> statement-breakpoint
ALTER TABLE "application_builds" ADD CONSTRAINT "application_builds_port_check" CHECK ("application_builds"."application_port" BETWEEN 1 AND 65535);
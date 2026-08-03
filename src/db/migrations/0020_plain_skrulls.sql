CREATE TYPE "public"."application_build_status" AS ENUM('queued', 'building', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."database_cluster_status" AS ENUM('provisioning', 'active', 'maintenance', 'unavailable', 'retired');--> statement-breakpoint
CREATE TYPE "public"."database_engine" AS ENUM('postgresql', 'mysql');--> statement-breakpoint
CREATE TYPE "public"."logical_database_status" AS ENUM('provisioning', 'active', 'suspended', 'failed');--> statement-breakpoint
CREATE TYPE "public"."runtime_image_status" AS ENUM('active', 'deprecated', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."runtime_language" AS ENUM('static', 'php', 'node', 'python');--> statement-breakpoint
CREATE TABLE "application_builds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"resource_id" uuid,
	"runtime_image_id" uuid NOT NULL,
	"status" "application_build_status" DEFAULT 'queued' NOT NULL,
	"source_repository" varchar(500) NOT NULL,
	"source_ref" varchar(255) DEFAULT 'main' NOT NULL,
	"commit_sha" varchar(64),
	"image_repository" varchar(500),
	"image_tag" varchar(255),
	"image_digest" varchar(255),
	"provider_build_id" varchar(255),
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failure_reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500),
	CONSTRAINT "application_builds_completion_check" CHECK ("application_builds"."completed_at" IS NULL OR "application_builds"."started_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "database_clusters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"engine" "database_engine" NOT NULL,
	"status" "database_cluster_status" DEFAULT 'provisioning' NOT NULL,
	"provider_resource_id" varchar(255) NOT NULL,
	"destination_uuid" varchar(255),
	"internal_host" varchar(255) NOT NULL,
	"port" integer NOT NULL,
	"admin_credential_ciphertext" text NOT NULL,
	"maximum_databases" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500),
	CONSTRAINT "database_clusters_port_check" CHECK ("database_clusters"."port" BETWEEN 1 AND 65535),
	CONSTRAINT "database_clusters_capacity_check" CHECK ("database_clusters"."maximum_databases" IS NULL OR "database_clusters"."maximum_databases" > 0)
);
--> statement-breakpoint
CREATE TABLE "logical_databases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"resource_id" uuid,
	"cluster_id" uuid NOT NULL,
	"status" "logical_database_status" DEFAULT 'provisioning' NOT NULL,
	"database_name" varchar(120) NOT NULL,
	"username" varchar(120) NOT NULL,
	"credential_ciphertext" text NOT NULL,
	"storage_quota_mb" integer,
	"connection_limit" integer,
	"last_backed_up_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500),
	CONSTRAINT "logical_databases_storage_quota_check" CHECK ("logical_databases"."storage_quota_mb" IS NULL OR "logical_databases"."storage_quota_mb" > 0),
	CONSTRAINT "logical_databases_connection_limit_check" CHECK ("logical_databases"."connection_limit" IS NULL OR "logical_databases"."connection_limit" > 0)
);
--> statement-breakpoint
CREATE TABLE "runtime_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(80) NOT NULL,
	"language" "runtime_language" NOT NULL,
	"version" varchar(40) NOT NULL,
	"registry" varchar(255) DEFAULT 'ghcr.io' NOT NULL,
	"repository" varchar(255) NOT NULL,
	"tag" varchar(120) NOT NULL,
	"digest" varchar(255),
	"status" "runtime_image_status" DEFAULT 'active' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
ALTER TABLE "application_builds" ADD CONSTRAINT "application_builds_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_builds" ADD CONSTRAINT "application_builds_resource_id_workspace_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."workspace_resources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_builds" ADD CONSTRAINT "application_builds_runtime_image_id_runtime_images_id_fk" FOREIGN KEY ("runtime_image_id") REFERENCES "public"."runtime_images"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logical_databases" ADD CONSTRAINT "logical_databases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logical_databases" ADD CONSTRAINT "logical_databases_resource_id_workspace_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."workspace_resources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logical_databases" ADD CONSTRAINT "logical_databases_cluster_id_database_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."database_clusters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_builds_workspace_status_idx" ON "application_builds" USING btree ("workspace_id","status","created_at");--> statement-breakpoint
CREATE INDEX "application_builds_resource_created_idx" ON "application_builds" USING btree ("resource_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "database_clusters_name_active_unique" ON "database_clusters" USING btree ("name") WHERE "database_clusters"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "database_clusters_provider_resource_active_unique" ON "database_clusters" USING btree ("provider_resource_id") WHERE "database_clusters"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "database_clusters_engine_status_idx" ON "database_clusters" USING btree ("engine","status");--> statement-breakpoint
CREATE UNIQUE INDEX "logical_databases_cluster_name_active_unique" ON "logical_databases" USING btree ("cluster_id","database_name") WHERE "logical_databases"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "logical_databases_cluster_username_active_unique" ON "logical_databases" USING btree ("cluster_id","username") WHERE "logical_databases"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "logical_databases_resource_active_unique" ON "logical_databases" USING btree ("resource_id") WHERE "logical_databases"."resource_id" IS NOT NULL AND "logical_databases"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "logical_databases_workspace_status_idx" ON "logical_databases" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "runtime_images_code_active_unique" ON "runtime_images" USING btree ("code") WHERE "runtime_images"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "runtime_images_reference_active_unique" ON "runtime_images" USING btree ("registry","repository","tag") WHERE "runtime_images"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "runtime_images_language_status_idx" ON "runtime_images" USING btree ("language","status");
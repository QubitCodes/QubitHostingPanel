CREATE TYPE "public"."application_public_error_mode" AS ENUM('generic', 'message', 'detailed');--> statement-breakpoint
CREATE TABLE "application_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_build_id" uuid NOT NULL,
	"migrate_on_deploy" boolean DEFAULT true NOT NULL,
	"migration_command" varchar(500),
	"migration_timeout_seconds" integer DEFAULT 900 NOT NULL,
	"run_seeder_on_deploy" boolean DEFAULT false NOT NULL,
	"seeder_command" varchar(500),
	"seeder_timeout_seconds" integer DEFAULT 900 NOT NULL,
	"maintenance_during_deployment" boolean DEFAULT false NOT NULL,
	"maintenance_enabled" boolean DEFAULT false NOT NULL,
	"maintenance_expires_at" timestamp with time zone,
	"coming_soon_enabled" boolean DEFAULT false NOT NULL,
	"coming_soon_expires_at" timestamp with time zone,
	"return_errors" boolean DEFAULT true NOT NULL,
	"public_error_mode" "application_public_error_mode" DEFAULT 'message' NOT NULL,
	"upload_max_file_size_mb" integer DEFAULT 50 NOT NULL,
	"upload_max_request_size_mb" integer DEFAULT 100 NOT NULL,
	"upload_timeout_seconds" integer DEFAULT 300 NOT NULL,
	"upload_allowed_extensions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"upload_allowed_mime_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500),
	CONSTRAINT "application_settings_migration_timeout_check" CHECK ("application_settings"."migration_timeout_seconds" BETWEEN 30 AND 3600),
	CONSTRAINT "application_settings_seeder_timeout_check" CHECK ("application_settings"."seeder_timeout_seconds" BETWEEN 30 AND 3600),
	CONSTRAINT "application_settings_upload_file_size_check" CHECK ("application_settings"."upload_max_file_size_mb" BETWEEN 1 AND 10240),
	CONSTRAINT "application_settings_upload_request_size_check" CHECK ("application_settings"."upload_max_request_size_mb" BETWEEN "application_settings"."upload_max_file_size_mb" AND 20480),
	CONSTRAINT "application_settings_upload_timeout_check" CHECK ("application_settings"."upload_timeout_seconds" BETWEEN 30 AND 3600)
);
--> statement-breakpoint
ALTER TABLE "application_settings" ADD CONSTRAINT "application_settings_application_build_id_application_builds_id_fk" FOREIGN KEY ("application_build_id") REFERENCES "public"."application_builds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "application_settings_application_active_unique" ON "application_settings" USING btree ("application_build_id") WHERE "application_settings"."deleted_at" IS NULL;
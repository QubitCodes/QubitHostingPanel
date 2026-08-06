CREATE TYPE "public"."application_operational_status" AS ENUM('active', 'paused', 'deactivated', 'suspended', 'deleting', 'cleanup_failed');--> statement-breakpoint
CREATE TYPE "public"."application_visibility" AS ENUM('public', 'private');--> statement-breakpoint
ALTER TABLE "application_builds" ADD COLUMN "operational_status" "application_operational_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "application_builds" ADD COLUMN "visibility" "application_visibility" DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "application_builds" ADD COLUMN "auto_deploy_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "application_builds" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "application_builds" ADD COLUMN "suspension_reason" text;--> statement-breakpoint
ALTER TABLE "application_deployments" ADD COLUMN "trigger" varchar(40) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "application_deployments" ADD COLUMN "commit_sha" varchar(64);--> statement-breakpoint
ALTER TABLE "application_deployments" ADD COLUMN "commit_message" text;--> statement-breakpoint
ALTER TABLE "application_deployments" ADD COLUMN "logs_ciphertext" text;--> statement-breakpoint
ALTER TABLE "application_deployments" ADD COLUMN "logs_captured_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "application_deployments" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "application_deployments_expiry_idx" ON "application_deployments" USING btree ("expires_at") WHERE "application_deployments"."deleted_at" IS NULL;
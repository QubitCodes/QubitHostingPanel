CREATE TYPE "public"."platform_deployment_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "platform_deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_connection_id" uuid,
	"target_application_uuid" varchar(120) NOT NULL,
	"provider_deployment_id" varchar(160),
	"requested_by_user_id" uuid NOT NULL,
	"status" "platform_deployment_status" DEFAULT 'queued' NOT NULL,
	"provider_status" varchar(120),
	"commit_sha" varchar(160),
	"commit_message" text,
	"logs" text DEFAULT '' NOT NULL,
	"failure_message" text,
	"last_poll_error" varchar(500),
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
ALTER TABLE "platform_deployments" ADD CONSTRAINT "platform_deployments_provider_connection_id_provider_connections_id_fk" FOREIGN KEY ("provider_connection_id") REFERENCES "public"."provider_connections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_deployments" ADD CONSTRAINT "platform_deployments_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "platform_deployments_active_target_unique" ON "platform_deployments" USING btree ("target_application_uuid") WHERE "platform_deployments"."status" IN ('queued', 'running') AND "platform_deployments"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "platform_deployments_created_idx" ON "platform_deployments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "platform_deployments_provider_deployment_idx" ON "platform_deployments" USING btree ("provider_deployment_id");
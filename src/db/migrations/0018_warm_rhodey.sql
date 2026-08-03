CREATE TYPE "public"."payment_attempt_status" AS ENUM('initiated', 'pending', 'verified', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_event_status" AS ENUM('received', 'processed', 'rejected', 'duplicate');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('mock', 'payu', 'razorpay');--> statement-breakpoint
CREATE TYPE "public"."hosting_provider" AS ENUM('mock', 'coolify');--> statement-breakpoint
CREATE TYPE "public"."provisioning_job_status" AS ENUM('queued', 'processing', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."workspace_resource_kind" AS ENUM('application', 'database', 'service');--> statement-breakpoint
CREATE TYPE "public"."workspace_resource_status" AS ENUM('provisioning', 'running', 'stopped', 'failed', 'unknown');--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checkout_id" uuid NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"status" "payment_attempt_status" DEFAULT 'initiated' NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"provider_order_id" varchar(255),
	"provider_payment_id" varchar(255),
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"customer_name" varchar(160) NOT NULL,
	"customer_email" varchar(320) NOT NULL,
	"failure_code" varchar(120),
	"failure_message" varchar(500),
	"provider_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "payment_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_attempt_id" uuid,
	"provider" "payment_provider" NOT NULL,
	"event_key" varchar(128) NOT NULL,
	"event_type" varchar(120) NOT NULL,
	"status" "payment_event_status" DEFAULT 'received' NOT NULL,
	"payload" jsonb NOT NULL,
	"rejection_reason" varchar(500),
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" text
);
--> statement-breakpoint
CREATE TABLE "provisioning_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"provider" "hosting_provider" NOT NULL,
	"status" "provisioning_job_status" DEFAULT 'queued' NOT NULL,
	"idempotency_key" varchar(200) NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"maximum_attempts" integer DEFAULT 5 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_error" text,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "workspace_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provisioning_job_id" uuid,
	"provider" "hosting_provider" NOT NULL,
	"kind" "workspace_resource_kind" NOT NULL,
	"name" varchar(160) NOT NULL,
	"provider_resource_id" varchar(255) NOT NULL,
	"provider_deployment_id" varchar(255),
	"status" "workspace_resource_status" DEFAULT 'provisioning' NOT NULL,
	"public_url" varchar(500),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_reconciled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
ALTER TABLE "customer_checkouts" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
UPDATE "customer_checkouts" SET "status" = CASE WHEN "status" = 'configured' THEN 'active' ELSE 'workspace_setup_pending' END WHERE "status" IN ('purchased', 'configured');--> statement-breakpoint
ALTER TABLE "customer_checkouts" ALTER COLUMN "status" SET DEFAULT 'awaiting_payment'::text;--> statement-breakpoint
DROP TYPE "public"."checkout_status";--> statement-breakpoint
CREATE TYPE "public"."checkout_status" AS ENUM('awaiting_payment', 'payment_pending', 'paid', 'workspace_setup_pending', 'provisioning', 'active', 'payment_failed', 'provisioning_failed', 'cancelled', 'expired');--> statement-breakpoint
ALTER TABLE "customer_checkouts" ALTER COLUMN "status" SET DEFAULT 'awaiting_payment'::"public"."checkout_status";--> statement-breakpoint
ALTER TABLE "customer_checkouts" ALTER COLUMN "status" SET DATA TYPE "public"."checkout_status" USING "status"::"public"."checkout_status";--> statement-breakpoint
ALTER TABLE "customer_checkouts" ALTER COLUMN "purchased_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "customer_checkouts" ALTER COLUMN "purchased_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_checkouts" ADD COLUMN "trial_selected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_checkout_id_customer_checkouts_id_fk" FOREIGN KEY ("checkout_id") REFERENCES "public"."customer_checkouts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_payment_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("payment_attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisioning_jobs" ADD CONSTRAINT "provisioning_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisioning_jobs" ADD CONSTRAINT "provisioning_jobs_subscription_id_workspace_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."workspace_subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_resources" ADD CONSTRAINT "workspace_resources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_resources" ADD CONSTRAINT "workspace_resources_provisioning_job_id_provisioning_jobs_id_fk" FOREIGN KEY ("provisioning_job_id") REFERENCES "public"."provisioning_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_idempotency_unique" ON "payment_attempts" USING btree ("idempotency_key") WHERE "payment_attempts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "payment_attempts_checkout_status_idx" ON "payment_attempts" USING btree ("checkout_id","status");--> statement-breakpoint
CREATE INDEX "payment_attempts_provider_order_idx" ON "payment_attempts" USING btree ("provider","provider_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_webhook_events_provider_key_unique" ON "payment_webhook_events" USING btree ("provider","event_key") WHERE "payment_webhook_events"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "payment_webhook_events_attempt_idx" ON "payment_webhook_events" USING btree ("payment_attempt_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "provisioning_jobs_idempotency_unique" ON "provisioning_jobs" USING btree ("idempotency_key") WHERE "provisioning_jobs"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "provisioning_jobs_runnable_idx" ON "provisioning_jobs" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "provisioning_jobs_workspace_idx" ON "provisioning_jobs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_resources_provider_resource_unique" ON "workspace_resources" USING btree ("provider","provider_resource_id") WHERE "workspace_resources"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "workspace_resources_workspace_status_idx" ON "workspace_resources" USING btree ("workspace_id","status");

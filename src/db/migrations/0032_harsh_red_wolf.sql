CREATE TYPE "public"."application_domain_tls_status" AS ENUM('pending', 'provisioning', 'active', 'failed');--> statement-breakpoint
ALTER TABLE "application_domains" ADD COLUMN "tls_status" "application_domain_tls_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "application_domains" ADD COLUMN "tls_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "application_domains" ADD COLUMN "tls_failure_reason" varchar(500);
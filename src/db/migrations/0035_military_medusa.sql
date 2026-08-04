CREATE TYPE "public"."dns_provider" AS ENUM('cloudflare', 'godaddy', 'hostinger', 'route53', 'manual');--> statement-breakpoint
CREATE TYPE "public"."dns_record_source" AS ENUM('discovered', 'imported', 'user', 'platform_managed');--> statement-breakpoint
CREATE TYPE "public"."dns_zone_status" AS ENUM('draft', 'pending_delegation', 'active', 'failed');--> statement-breakpoint
CREATE TABLE "dns_import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zone_id" uuid NOT NULL,
	"source" "dns_provider" NOT NULL,
	"status" varchar(32) NOT NULL,
	"discovered_count" integer DEFAULT 0 NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "dns_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zone_id" uuid NOT NULL,
	"application_domain_id" uuid,
	"name" varchar(255) NOT NULL,
	"type" varchar(16) NOT NULL,
	"content" text NOT NULL,
	"ttl" integer DEFAULT 300 NOT NULL,
	"priority" integer,
	"proxied" boolean DEFAULT false NOT NULL,
	"source" "dns_record_source" NOT NULL,
	"provider_record_id" varchar(255),
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "dns_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"ownership_id" uuid NOT NULL,
	"hostname" varchar(255) NOT NULL,
	"provider" "dns_provider" DEFAULT 'cloudflare' NOT NULL,
	"provider_zone_id" varchar(255),
	"status" "dns_zone_status" DEFAULT 'draft' NOT NULL,
	"nameservers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"delegation_verified_at" timestamp with time zone,
	"last_imported_at" timestamp with time zone,
	"last_synchronized_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "dns_provider" varchar(40) DEFAULT 'cloudflare' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "ingress_ipv4" varchar(45);--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "ingress_ipv6" varchar(45);--> statement-breakpoint
ALTER TABLE "dns_import_runs" ADD CONSTRAINT "dns_import_runs_zone_id_dns_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."dns_zones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dns_records" ADD CONSTRAINT "dns_records_zone_id_dns_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."dns_zones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dns_records" ADD CONSTRAINT "dns_records_application_domain_id_application_domains_id_fk" FOREIGN KEY ("application_domain_id") REFERENCES "public"."application_domains"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dns_zones" ADD CONSTRAINT "dns_zones_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dns_zones" ADD CONSTRAINT "dns_zones_ownership_id_domain_ownerships_id_fk" FOREIGN KEY ("ownership_id") REFERENCES "public"."domain_ownerships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dns_records_value_active_unique" ON "dns_records" USING btree ("zone_id","name","type","content") WHERE "dns_records"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "dns_records_zone_name_idx" ON "dns_records" USING btree ("zone_id","name");--> statement-breakpoint
CREATE INDEX "dns_records_application_domain_idx" ON "dns_records" USING btree ("application_domain_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dns_zones_ownership_active_unique" ON "dns_zones" USING btree ("ownership_id") WHERE "dns_zones"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "dns_zones_workspace_status_idx" ON "dns_zones" USING btree ("workspace_id","status");
CREATE TYPE "public"."domain_verification_status" AS ENUM('pending', 'verified', 'failed');--> statement-breakpoint
CREATE TYPE "public"."panel_domain_mode" AS ENUM('same_domain', 'separate_domain');--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(40) DEFAULT 'default' NOT NULL,
	"public_base_url" varchar(500) NOT NULL,
	"panel_domain_mode" "panel_domain_mode" DEFAULT 'same_domain' NOT NULL,
	"panel_base_url" varchar(500),
	"panel_domain_status" "domain_verification_status" DEFAULT 'pending' NOT NULL,
	"application_base_domain" varchar(255) NOT NULL,
	"application_domain_status" "domain_verification_status" DEFAULT 'pending' NOT NULL,
	"default_application_subdomain_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500),
	CONSTRAINT "platform_settings_panel_url_check" CHECK ("platform_settings"."panel_domain_mode" = 'same_domain' OR "platform_settings"."panel_base_url" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "platform_settings_key_active_unique" ON "platform_settings" USING btree ("key") WHERE "platform_settings"."deleted_at" IS NULL;
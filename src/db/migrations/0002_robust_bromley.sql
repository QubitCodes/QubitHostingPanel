ALTER TABLE "user_sessions" ADD COLUMN "device_label" varchar(100);--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "device_identifier_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "device_type" varchar(40);--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "device_vendor" varchar(80);--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "device_model" varchar(120);--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "browser_name" varchar(80);--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "browser_version" varchar(40);--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "os_name" varchar(80);--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "os_version" varchar(40);--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "city" varchar(120);--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "region" varchar(120);--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "country" varchar(120);--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "country_code" varchar(8);--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "timezone" varchar(80);--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "latitude" varchar(32);--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "longitude" varchar(32);--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "network_asn" varchar(32);--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "network_name" varchar(160);--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "client_hints" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "signed_in_at" timestamp with time zone DEFAULT now() NOT NULL;
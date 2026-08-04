CREATE TYPE "public"."application_domain_status" AS ENUM('pending', 'verified', 'failed');--> statement-breakpoint
CREATE TYPE "public"."application_domain_type" AS ENUM('platform', 'custom');--> statement-breakpoint
CREATE TABLE "application_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_build_id" uuid NOT NULL,
	"hostname" varchar(255) NOT NULL,
	"type" "application_domain_type" NOT NULL,
	"status" "application_domain_status" DEFAULT 'pending' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"verification_token" varchar(120),
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
ALTER TABLE "application_domains" ADD CONSTRAINT "application_domains_application_build_id_application_builds_id_fk" FOREIGN KEY ("application_build_id") REFERENCES "public"."application_builds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "application_domains_hostname_active_unique" ON "application_domains" USING btree ("hostname") WHERE "application_domains"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "application_domains_platform_application_unique" ON "application_domains" USING btree ("application_build_id") WHERE "application_domains"."type" = 'platform' AND "application_domains"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "application_domains_primary_application_unique" ON "application_domains" USING btree ("application_build_id") WHERE "application_domains"."is_primary" = true AND "application_domains"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "application_domains_application_status_idx" ON "application_domains" USING btree ("application_build_id","status");
--> statement-breakpoint
INSERT INTO "application_domains" ("application_build_id", "hostname", "type", "status", "is_primary", "is_enabled", "verified_at")
SELECT "id", lower("requested_domain"), 'custom', 'verified', true, true, now()
FROM "application_builds"
WHERE "requested_domain" IS NOT NULL AND "deleted_at" IS NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "application_domains" ("application_build_id", "hostname", "type", "status", "is_primary", "is_enabled", "verified_at")
SELECT b."id", lower(split_part(regexp_replace(r."public_url", '^https?://', ''), '/', 1)), 'platform', 'verified', true, true, now()
FROM "application_builds" b
INNER JOIN "workspace_resources" r ON r."id" = b."resource_id"
WHERE b."requested_domain" IS NULL AND b."deleted_at" IS NULL AND r."deleted_at" IS NULL AND r."public_url" IS NOT NULL
ON CONFLICT DO NOTHING;

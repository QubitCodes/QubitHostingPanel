CREATE TYPE "public"."domain_access_request_status" AS ENUM('pending', 'approved', 'rejected', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."domain_ownership_status" AS ENUM('pending', 'verified', 'revoked');--> statement-breakpoint
CREATE TABLE "domain_access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ownership_id" uuid NOT NULL,
	"requesting_workspace_id" uuid NOT NULL,
	"application_build_id" uuid NOT NULL,
	"application_domain_id" uuid NOT NULL,
	"hostname" varchar(255) NOT NULL,
	"status" "domain_access_request_status" DEFAULT 'pending' NOT NULL,
	"responded_at" timestamp with time zone,
	"responded_by_workspace_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "domain_ownerships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"hostname" varchar(255) NOT NULL,
	"status" "domain_ownership_status" DEFAULT 'pending' NOT NULL,
	"verification_token" varchar(120),
	"verification_method" varchar(40) DEFAULT 'dns_txt' NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "domain_ownership_verification_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "domain_access_requests" ADD CONSTRAINT "domain_access_requests_ownership_id_domain_ownerships_id_fk" FOREIGN KEY ("ownership_id") REFERENCES "public"."domain_ownerships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_access_requests" ADD CONSTRAINT "domain_access_requests_requesting_workspace_id_workspaces_id_fk" FOREIGN KEY ("requesting_workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_access_requests" ADD CONSTRAINT "domain_access_requests_application_build_id_application_builds_id_fk" FOREIGN KEY ("application_build_id") REFERENCES "public"."application_builds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_access_requests" ADD CONSTRAINT "domain_access_requests_application_domain_id_application_domains_id_fk" FOREIGN KEY ("application_domain_id") REFERENCES "public"."application_domains"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_access_requests" ADD CONSTRAINT "domain_access_requests_responded_by_workspace_id_workspaces_id_fk" FOREIGN KEY ("responded_by_workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_ownerships" ADD CONSTRAINT "domain_ownerships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "application_domains" left_domain
		INNER JOIN "application_builds" left_build ON left_build."id" = left_domain."application_build_id"
		INNER JOIN "application_domains" right_domain ON right_domain."id" <> left_domain."id"
		INNER JOIN "application_builds" right_build ON right_build."id" = right_domain."application_build_id"
		WHERE left_domain."type" = 'custom'
			AND right_domain."type" = 'custom'
			AND left_domain."status" = 'verified'
			AND right_domain."status" = 'verified'
			AND left_domain."deleted_at" IS NULL
			AND right_domain."deleted_at" IS NULL
			AND left_build."deleted_at" IS NULL
			AND right_build."deleted_at" IS NULL
			AND left_build."workspace_id" <> right_build."workspace_id"
			AND left_domain."hostname" LIKE ('%.' || right_domain."hostname")
	) THEN
		RAISE EXCEPTION 'Verified custom-domain ownership conflict detected between workspaces. Resolve the parent/subdomain conflict before applying this migration.';
	END IF;
END $$;--> statement-breakpoint
INSERT INTO "domain_ownerships" ("workspace_id", "hostname", "status", "verification_method", "verified_at")
SELECT application_builds."workspace_id", application_domains."hostname", 'verified', 'legacy_verified', COALESCE(application_domains."verified_at", now())
FROM "application_domains"
INNER JOIN "application_builds" ON application_builds."id" = application_domains."application_build_id"
WHERE application_domains."type" = 'custom'
	AND application_domains."status" = 'verified'
	AND application_domains."deleted_at" IS NULL
	AND application_builds."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "domain_access_requests_domain_active_unique" ON "domain_access_requests" USING btree ("application_domain_id") WHERE "domain_access_requests"."deleted_at" IS NULL AND "domain_access_requests"."status" IN ('pending', 'approved');--> statement-breakpoint
CREATE INDEX "domain_access_requests_ownership_status_idx" ON "domain_access_requests" USING btree ("ownership_id","status");--> statement-breakpoint
CREATE INDEX "domain_access_requests_requester_status_idx" ON "domain_access_requests" USING btree ("requesting_workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_ownerships_hostname_active_unique" ON "domain_ownerships" USING btree ("hostname") WHERE "domain_ownerships"."deleted_at" IS NULL AND "domain_ownerships"."status" <> 'revoked';--> statement-breakpoint
CREATE INDEX "domain_ownerships_workspace_status_idx" ON "domain_ownerships" USING btree ("workspace_id","status");

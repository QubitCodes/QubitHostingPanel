CREATE TYPE "public"."usage_observation_status" AS ENUM('fresh', 'stale', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."usage_reservation_status" AS ENUM('pending', 'committed', 'released', 'expired');--> statement-breakpoint
CREATE TABLE "workspace_entitlement_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"entitlement_code" varchar(120) NOT NULL,
	"enforcement_mode" varchar(30),
	"numeric_value" bigint,
	"boolean_value" boolean,
	"is_unlimited" boolean DEFAULT false NOT NULL,
	"reason" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	"revoke_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500),
	CONSTRAINT "workspace_entitlement_overrides_value_check" CHECK (("workspace_entitlement_overrides"."is_unlimited" = true AND "workspace_entitlement_overrides"."numeric_value" IS NULL AND "workspace_entitlement_overrides"."boolean_value" IS NULL) OR ("workspace_entitlement_overrides"."is_unlimited" = false AND num_nonnulls("workspace_entitlement_overrides"."numeric_value", "workspace_entitlement_overrides"."boolean_value") = 1)),
	CONSTRAINT "workspace_entitlement_overrides_mode_check" CHECK ("workspace_entitlement_overrides"."enforcement_mode" IS NULL OR "workspace_entitlement_overrides"."enforcement_mode" IN ('hard','soft','metered','informational'))
);
--> statement-breakpoint
CREATE TABLE "workspace_usage_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"entitlement_code" varchar(120) NOT NULL,
	"value" bigint NOT NULL,
	"unit" varchar(60),
	"source" varchar(80) NOT NULL,
	"status" "usage_observation_status" DEFAULT 'fresh' NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"observed_at" timestamp with time zone NOT NULL,
	"stale_after" timestamp with time zone NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500),
	CONSTRAINT "workspace_usage_observations_value_check" CHECK ("workspace_usage_observations"."value" >= 0),
	CONSTRAINT "workspace_usage_observations_period_check" CHECK ("workspace_usage_observations"."period_end" IS NULL OR "workspace_usage_observations"."period_start" IS NOT NULL AND "workspace_usage_observations"."period_end" > "workspace_usage_observations"."period_start"),
	CONSTRAINT "workspace_usage_observations_freshness_check" CHECK ("workspace_usage_observations"."stale_after" >= "workspace_usage_observations"."observed_at")
);
--> statement-breakpoint
CREATE TABLE "workspace_usage_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"subscription_id" uuid,
	"entitlement_code" varchar(120) NOT NULL,
	"quantity" bigint NOT NULL,
	"idempotency_key" varchar(200) NOT NULL,
	"status" "usage_reservation_status" DEFAULT 'pending' NOT NULL,
	"resource_type" varchar(80),
	"resource_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"committed_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"release_reason" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500),
	CONSTRAINT "workspace_usage_reservations_quantity_check" CHECK ("workspace_usage_reservations"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "workspace_entitlement_overrides" ADD CONSTRAINT "workspace_entitlement_overrides_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_entitlement_overrides" ADD CONSTRAINT "workspace_entitlement_overrides_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_entitlement_overrides" ADD CONSTRAINT "workspace_entitlement_overrides_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_usage_observations" ADD CONSTRAINT "workspace_usage_observations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_usage_reservations" ADD CONSTRAINT "workspace_usage_reservations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_usage_reservations" ADD CONSTRAINT "workspace_usage_reservations_subscription_id_workspace_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."workspace_subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_entitlement_overrides_active_unique" ON "workspace_entitlement_overrides" USING btree ("workspace_id","entitlement_code") WHERE "workspace_entitlement_overrides"."revoked_at" IS NULL AND "workspace_entitlement_overrides"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "workspace_entitlement_overrides_expiry_idx" ON "workspace_entitlement_overrides" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "workspace_usage_observations_latest_idx" ON "workspace_usage_observations" USING btree ("workspace_id","entitlement_code","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_usage_reservations_idempotency_unique" ON "workspace_usage_reservations" USING btree ("workspace_id","idempotency_key") WHERE "workspace_usage_reservations"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "workspace_usage_reservations_pending_idx" ON "workspace_usage_reservations" USING btree ("workspace_id","entitlement_code","status","expires_at");
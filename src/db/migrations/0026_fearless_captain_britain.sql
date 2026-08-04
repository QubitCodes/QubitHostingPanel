CREATE TYPE "public"."workspace_ownership_transfer_status" AS ENUM('pending', 'accepted', 'declined', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."subscription_item_status" AS ENUM('active', 'cancelled', 'expired');--> statement-breakpoint
CREATE TABLE "workspace_billing_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"display_name" varchar(200) NOT NULL,
	"legal_name" varchar(200),
	"contact_email" varchar(320) NOT NULL,
	"contact_country_code" varchar(8),
	"contact_mobile" varchar(32),
	"gstin" varchar(15),
	"address_line_1" varchar(255) NOT NULL,
	"address_line_2" varchar(255),
	"city" varchar(120) NOT NULL,
	"region" varchar(120) NOT NULL,
	"postal_code" varchar(20) NOT NULL,
	"country_code" varchar(2) DEFAULT 'IN' NOT NULL,
	"source_profile_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500),
	CONSTRAINT "workspace_billing_profiles_country_check" CHECK ("workspace_billing_profiles"."country_code" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "workspace_ownership_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"from_customer_id" uuid NOT NULL,
	"to_customer_id" uuid NOT NULL,
	"status" "workspace_ownership_transfer_status" DEFAULT 'pending' NOT NULL,
	"reason" text,
	"expires_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500),
	CONSTRAINT "workspace_ownership_transfers_distinct_check" CHECK ("workspace_ownership_transfers"."from_customer_id" <> "workspace_ownership_transfers"."to_customer_id")
);
--> statement-breakpoint
CREATE TABLE "workspace_subscription_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"code" varchar(120) NOT NULL,
	"name_snapshot" varchar(160) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"entitlement_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "subscription_item_status" DEFAULT 'active' NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500),
	CONSTRAINT "workspace_subscription_items_quantity_check" CHECK ("workspace_subscription_items"."quantity" > 0 AND "workspace_subscription_items"."unit_amount_minor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "customer_checkouts" ADD COLUMN "offer_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_checkouts" ADD COLUMN "billing_profile_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "workspace_subscriptions" ADD COLUMN "is_primary" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_subscriptions" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_subscriptions" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspace_subscriptions" ADD COLUMN "cancellation_reason" varchar(500);--> statement-breakpoint
ALTER TABLE "workspace_billing_profiles" ADD CONSTRAINT "workspace_billing_profiles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_billing_profiles" ADD CONSTRAINT "workspace_billing_profiles_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_ownership_transfers" ADD CONSTRAINT "workspace_ownership_transfers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_ownership_transfers" ADD CONSTRAINT "workspace_ownership_transfers_from_customer_id_customers_id_fk" FOREIGN KEY ("from_customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_ownership_transfers" ADD CONSTRAINT "workspace_ownership_transfers_to_customer_id_customers_id_fk" FOREIGN KEY ("to_customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_subscription_items" ADD CONSTRAINT "workspace_subscription_items_subscription_id_workspace_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."workspace_subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_billing_profiles_version_unique" ON "workspace_billing_profiles" USING btree ("workspace_id","version");--> statement-breakpoint
CREATE INDEX "workspace_billing_profiles_workspace_created_idx" ON "workspace_billing_profiles" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_ownership_transfers_pending_unique" ON "workspace_ownership_transfers" USING btree ("workspace_id") WHERE "workspace_ownership_transfers"."status" = 'pending' AND "workspace_ownership_transfers"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "workspace_ownership_transfers_recipient_status_idx" ON "workspace_ownership_transfers" USING btree ("to_customer_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_subscription_items_active_unique" ON "workspace_subscription_items" USING btree ("subscription_id","code") WHERE "workspace_subscription_items"."status" = 'active' AND "workspace_subscription_items"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_subscriptions_primary_active_unique" ON "workspace_subscriptions" USING btree ("workspace_id") WHERE "workspace_subscriptions"."is_primary" = true AND "workspace_subscriptions"."status" IN ('trialing', 'active') AND "workspace_subscriptions"."deleted_at" IS NULL;
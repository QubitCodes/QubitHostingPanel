CREATE TYPE "public"."checkout_status" AS ENUM('purchased', 'configured', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."workspace_subscription_status" AS ENUM('trialing', 'active', 'cancelled', 'expired');--> statement-breakpoint
CREATE SEQUENCE "public"."checkout_public_id_seq" INCREMENT BY 1 MINVALUE 100000 MAXVALUE 999999 START WITH 100000 CACHE 1;--> statement-breakpoint
CREATE TABLE "customer_checkouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" integer DEFAULT nextval('checkout_public_id_seq') NOT NULL,
	"customer_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"price_id" uuid NOT NULL,
	"workspace_id" uuid,
	"status" "checkout_status" DEFAULT 'purchased' NOT NULL,
	"package_name_snapshot" varchar(160) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"billing_interval" "price_billing_interval" NOT NULL,
	"interval_count" integer NOT NULL,
	"subtotal_minor" bigint NOT NULL,
	"discount_minor" bigint NOT NULL,
	"tax_minor" bigint NOT NULL,
	"total_minor" bigint NOT NULL,
	"applied_offer_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL,
	"configured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500),
	CONSTRAINT "customer_checkouts_public_id_check" CHECK ("customer_checkouts"."public_id" BETWEEN 100000 AND 999999),
	CONSTRAINT "customer_checkouts_amounts_check" CHECK ("customer_checkouts"."subtotal_minor" >= 0 AND "customer_checkouts"."discount_minor" >= 0 AND "customer_checkouts"."tax_minor" >= 0 AND "customer_checkouts"."total_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "workspace_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"checkout_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"price_id" uuid NOT NULL,
	"status" "workspace_subscription_status" DEFAULT 'active' NOT NULL,
	"package_snapshot" jsonb NOT NULL,
	"entitlement_snapshot" jsonb NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"term_ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" text
);
--> statement-breakpoint
ALTER TABLE "customer_checkouts" ADD CONSTRAINT "customer_checkouts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_checkouts" ADD CONSTRAINT "customer_checkouts_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_checkouts" ADD CONSTRAINT "customer_checkouts_price_id_package_prices_id_fk" FOREIGN KEY ("price_id") REFERENCES "public"."package_prices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_checkouts" ADD CONSTRAINT "customer_checkouts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_subscriptions" ADD CONSTRAINT "workspace_subscriptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_subscriptions" ADD CONSTRAINT "workspace_subscriptions_checkout_id_customer_checkouts_id_fk" FOREIGN KEY ("checkout_id") REFERENCES "public"."customer_checkouts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_subscriptions" ADD CONSTRAINT "workspace_subscriptions_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_subscriptions" ADD CONSTRAINT "workspace_subscriptions_price_id_package_prices_id_fk" FOREIGN KEY ("price_id") REFERENCES "public"."package_prices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_checkouts_public_id_unique" ON "customer_checkouts" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "customer_checkouts_customer_status_idx" ON "customer_checkouts" USING btree ("customer_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_subscriptions_checkout_unique" ON "workspace_subscriptions" USING btree ("checkout_id");--> statement-breakpoint
CREATE INDEX "workspace_subscriptions_workspace_status_idx" ON "workspace_subscriptions" USING btree ("workspace_id","status");
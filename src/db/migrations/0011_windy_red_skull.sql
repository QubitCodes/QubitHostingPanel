CREATE TYPE "public"."offer_discount_type" AS ENUM('percentage', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."offer_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TABLE "offer_eligible_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"package_id" uuid,
	"price_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "offer_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"checkout_reference" uuid NOT NULL,
	"customer_reference" varchar(160),
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(160) NOT NULL,
	"description" text,
	"coupon_code" varchar(60),
	"discount_type" "offer_discount_type" NOT NULL,
	"percentage_basis_points" integer,
	"fixed_amount_minor" integer,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"status" "offer_status" DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"new_customer_only" boolean DEFAULT false NOT NULL,
	"max_redemptions" integer,
	"max_redemptions_per_customer" integer DEFAULT 1 NOT NULL,
	"stackable" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
ALTER TABLE "offer_eligible_prices" ADD CONSTRAINT "offer_eligible_prices_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_eligible_prices" ADD CONSTRAINT "offer_eligible_prices_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_eligible_prices" ADD CONSTRAINT "offer_eligible_prices_price_id_package_prices_id_fk" FOREIGN KEY ("price_id") REFERENCES "public"."package_prices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_redemptions" ADD CONSTRAINT "offer_redemptions_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "offer_eligible_prices_unique" ON "offer_eligible_prices" USING btree ("offer_id","package_id","price_id") WHERE "offer_eligible_prices"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "offer_redemptions_offer_customer_idx" ON "offer_redemptions" USING btree ("offer_id","customer_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "offers_slug_unique" ON "offers" USING btree ("slug") WHERE "offers"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "offers_coupon_code_unique" ON "offers" USING btree ("coupon_code") WHERE "offers"."coupon_code" IS NOT NULL AND "offers"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "offers_active_period_idx" ON "offers" USING btree ("status","starts_at","ends_at");
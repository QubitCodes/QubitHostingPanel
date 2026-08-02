CREATE TYPE "public"."offer_customer_eligibility" AS ENUM('everyone', 'new_customers', 'existing_customers');--> statement-breakpoint
CREATE TYPE "public"."offer_discount_recurrence" AS ENUM('once', 'cycles', 'term');--> statement-breakpoint
CREATE TYPE "public"."offer_subscription_event" AS ENUM('new_subscription', 'renewal', 'both');--> statement-breakpoint
CREATE TYPE "public"."offer_trial_handling" AS ENUM('after_trial', 'immediate', 'exclude_trial');--> statement-breakpoint
CREATE TABLE "offer_eligible_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"billing_interval" "price_billing_interval" NOT NULL,
	"interval_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500),
	CONSTRAINT "offer_eligible_terms_interval_count_check" CHECK ("offer_eligible_terms"."interval_count" > 0)
);
--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "customer_eligibility" "offer_customer_eligibility" DEFAULT 'everyone' NOT NULL;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "subscription_event" "offer_subscription_event" DEFAULT 'both' NOT NULL;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "discount_recurrence" "offer_discount_recurrence" DEFAULT 'once' NOT NULL;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "recurrence_cycles" integer;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "trial_handling" "offer_trial_handling" DEFAULT 'after_trial' NOT NULL;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "minimum_subtotal_minor" integer;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "maximum_discount_minor" integer;--> statement-breakpoint
UPDATE "offers" SET "customer_eligibility" = 'new_customers' WHERE "new_customer_only" = true;--> statement-breakpoint
ALTER TABLE "offer_eligible_terms" ADD CONSTRAINT "offer_eligible_terms_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "offer_eligible_terms_unique" ON "offer_eligible_terms" USING btree ("offer_id","billing_interval","interval_count") WHERE "offer_eligible_terms"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_recurrence_cycles_check" CHECK (("offers"."discount_recurrence" = 'cycles' AND "offers"."recurrence_cycles" > 0) OR ("offers"."discount_recurrence" <> 'cycles' AND "offers"."recurrence_cycles" IS NULL));--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_minimum_subtotal_check" CHECK ("offers"."minimum_subtotal_minor" IS NULL OR "offers"."minimum_subtotal_minor" > 0);--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_maximum_discount_check" CHECK ("offers"."maximum_discount_minor" IS NULL OR "offers"."maximum_discount_minor" > 0);

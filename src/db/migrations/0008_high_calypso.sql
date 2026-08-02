CREATE TYPE "public"."price_assignment_status" AS ENUM('active', 'ended');--> statement-breakpoint
CREATE TYPE "public"."cost_review_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."entitlement_enforcement_mode" AS ENUM('hard', 'soft', 'metered', 'informational');--> statement-breakpoint
CREATE TYPE "public"."entitlement_value_type" AS ENUM('number', 'boolean');--> statement-breakpoint
CREATE TABLE "email_usage_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(160) NOT NULL,
	"included_recipients" integer NOT NULL,
	"monthly_price_minor" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "entitlement_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(120) NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"value_type" "entitlement_value_type" NOT NULL,
	"unit" varchar(60),
	"enforcement_mode" "entitlement_enforcement_mode" NOT NULL,
	"reset_period" varchar(30),
	"is_customer_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "package_cost_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"estimated_monthly_cost_minor" integer NOT NULL,
	"revenue_minor" integer NOT NULL,
	"margin_basis_points" integer NOT NULL,
	"status" "cost_review_status" DEFAULT 'pending' NOT NULL,
	"notes" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "package_entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"entitlement_id" uuid NOT NULL,
	"numeric_value" integer,
	"boolean_value" boolean,
	"is_unlimited" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500),
	CONSTRAINT "package_entitlements_value_check" CHECK (("package_entitlements"."is_unlimited" = true AND "package_entitlements"."numeric_value" IS NULL AND "package_entitlements"."boolean_value" IS NULL) OR ("package_entitlements"."is_unlimited" = false AND num_nonnulls("package_entitlements"."numeric_value", "package_entitlements"."boolean_value") = 1))
);
--> statement-breakpoint
CREATE TABLE "package_price_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"price_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "price_assignment_status" DEFAULT 'active' NOT NULL,
	"term_ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
ALTER TABLE "package_cost_reviews" ADD CONSTRAINT "package_cost_reviews_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_cost_reviews" ADD CONSTRAINT "package_cost_reviews_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_entitlements" ADD CONSTRAINT "package_entitlements_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_entitlements" ADD CONSTRAINT "package_entitlements_entitlement_id_entitlement_definitions_id_fk" FOREIGN KEY ("entitlement_id") REFERENCES "public"."entitlement_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_price_assignments" ADD CONSTRAINT "package_price_assignments_price_id_package_prices_id_fk" FOREIGN KEY ("price_id") REFERENCES "public"."package_prices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_price_assignments" ADD CONSTRAINT "package_price_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_usage_products_slug_unique" ON "email_usage_products" USING btree ("slug") WHERE "email_usage_products"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "entitlement_definitions_code_unique" ON "entitlement_definitions" USING btree ("code") WHERE "entitlement_definitions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "package_cost_reviews_package_idx" ON "package_cost_reviews" USING btree ("package_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "package_entitlements_active_unique" ON "package_entitlements" USING btree ("package_id","entitlement_id") WHERE "package_entitlements"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "package_price_assignments_active_idx" ON "package_price_assignments" USING btree ("price_id","status","term_ends_at");
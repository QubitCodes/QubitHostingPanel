CREATE TYPE "public"."price_billing_interval" AS ENUM('month', 'year');--> statement-breakpoint
CREATE TYPE "public"."price_tax_behavior" AS ENUM('exclusive', 'inclusive');--> statement-breakpoint
CREATE TABLE "package_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"billing_interval" "price_billing_interval" NOT NULL,
	"interval_count" integer DEFAULT 1 NOT NULL,
	"amount_minor" bigint NOT NULL,
	"tax_behavior" "price_tax_behavior" DEFAULT 'exclusive' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500),
	CONSTRAINT "package_prices_interval_count_check" CHECK ("package_prices"."interval_count" > 0),
	CONSTRAINT "package_prices_amount_minor_check" CHECK ("package_prices"."amount_minor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "package_prices" ADD CONSTRAINT "package_prices_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "package_prices_package_history_idx" ON "package_prices" USING btree ("package_id","billing_interval","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "package_prices_current_public_unique" ON "package_prices" USING btree ("package_id","currency","billing_interval","interval_count") WHERE "package_prices"."is_active" = true AND "package_prices"."is_public" = true AND "package_prices"."deleted_at" IS NULL;
--> statement-breakpoint
INSERT INTO "package_categories" ("name", "slug", "description", "display_order") VALUES
	('Cloud App Hosting', 'cloud-app-hosting', 'Managed application hosting on shared cloud capacity.', 10),
	('Managed Cloud', 'managed-cloud', 'Dedicated managed cloud capacity for demanding workloads.', 20)
ON CONFLICT ("slug") WHERE "deleted_at" IS NULL DO UPDATE SET
	"name" = EXCLUDED."name",
	"description" = EXCLUDED."description",
	"display_order" = EXCLUDED."display_order",
	"updated_at" = now();
--> statement-breakpoint
INSERT INTO "packages" ("category_id", "name", "slug", "description", "status", "display_order", "trial_enabled", "trial_duration", "trial_duration_unit")
SELECT category.id, seed.name, seed.slug, seed.description, 'draft'::"package_status", seed.display_order, seed.trial_enabled, seed.trial_duration, seed.trial_unit::"trial_duration_unit"
FROM (VALUES
	('cloud-app-hosting', 'Launch', 'launch', 'A focused starter plan for one production application.', 10, true, 7, 'day'),
	('cloud-app-hosting', 'Growth', 'growth', 'Room for growing applications, databases, domains, and daily backups.', 20, true, 7, 'day'),
	('cloud-app-hosting', 'Business', 'business', 'Higher application and database capacity for established teams.', 30, true, 14, 'day'),
	('managed-cloud', 'Cloud 2 GB', 'cloud-2-gb', 'Managed cloud environment with a 2 GB compute target.', 40, false, NULL, NULL),
	('managed-cloud', 'Cloud 4 GB', 'cloud-4-gb', 'Managed cloud environment with a 4 GB compute target.', 50, false, NULL, NULL),
	('managed-cloud', 'Cloud 8 GB', 'cloud-8-gb', 'Managed cloud environment with an 8 GB compute target.', 60, false, NULL, NULL)
) AS seed(category_slug, name, slug, description, display_order, trial_enabled, trial_duration, trial_unit)
JOIN "package_categories" category ON category.slug = seed.category_slug AND category.deleted_at IS NULL
ON CONFLICT ("slug") WHERE "deleted_at" IS NULL DO UPDATE SET
	"category_id" = EXCLUDED."category_id",
	"name" = EXCLUDED."name",
	"description" = EXCLUDED."description",
	"display_order" = EXCLUDED."display_order",
	"updated_at" = now();
--> statement-breakpoint
INSERT INTO "package_prices" ("package_id", "currency", "billing_interval", "amount_minor", "tax_behavior", "is_active", "is_public")
SELECT package.id, 'INR', seed.billing_interval::"price_billing_interval", seed.amount_minor, 'exclusive'::"price_tax_behavior", true, false
FROM (VALUES
	('launch', 'month', 39900), ('launch', 'year', 399000),
	('growth', 'month', 79900), ('growth', 'year', 799000),
	('business', 'month', 149900), ('business', 'year', 1499000),
	('cloud-2-gb', 'month', 249900), ('cloud-2-gb', 'year', 2499000),
	('cloud-4-gb', 'month', 449900), ('cloud-4-gb', 'year', 4499000),
	('cloud-8-gb', 'month', 799900), ('cloud-8-gb', 'year', 7999000)
) AS seed(package_slug, billing_interval, amount_minor)
JOIN "packages" package ON package.slug = seed.package_slug AND package.deleted_at IS NULL
WHERE NOT EXISTS (
	SELECT 1 FROM "package_prices" existing
	WHERE existing.package_id = package.id
		AND existing.currency = 'INR'
		AND existing.billing_interval = seed.billing_interval::"price_billing_interval"
		AND existing.is_active = true
		AND existing.deleted_at IS NULL
);

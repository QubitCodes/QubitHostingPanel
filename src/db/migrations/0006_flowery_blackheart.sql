CREATE TYPE "public"."package_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."trial_duration_unit" AS ENUM('day', 'week', 'month');--> statement-breakpoint
CREATE TABLE "package_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"description" varchar(500),
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid,
	"name" varchar(160) NOT NULL,
	"slug" varchar(160) NOT NULL,
	"description" text,
	"status" "package_status" DEFAULT 'draft' NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"trial_enabled" boolean DEFAULT false NOT NULL,
	"trial_duration" integer,
	"trial_duration_unit" "trial_duration_unit",
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500),
	CONSTRAINT "packages_trial_configuration_check" CHECK (("packages"."trial_enabled" = false AND "packages"."trial_duration" IS NULL AND "packages"."trial_duration_unit" IS NULL) OR ("packages"."trial_enabled" = true AND "packages"."trial_duration" > 0 AND "packages"."trial_duration_unit" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_category_id_package_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."package_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "package_categories_slug_unique" ON "package_categories" USING btree ("slug") WHERE "package_categories"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "package_categories_active_order_idx" ON "package_categories" USING btree ("is_active","display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "packages_slug_unique" ON "packages" USING btree ("slug") WHERE "packages"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "packages_status_order_idx" ON "packages" USING btree ("status","display_order");--> statement-breakpoint
CREATE INDEX "packages_category_idx" ON "packages" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "packages_published_idx" ON "packages" USING btree ("published_at");
--> statement-breakpoint
INSERT INTO "platform_permissions" ("code", "name", "description") VALUES
	('package_categories.view', 'View package categories', 'View package-category options.'),
	('package_categories.create', 'Create package categories', 'Create package categories, including from inline selectors.'),
	('package_categories.update', 'Update package categories', 'Update package-category details.'),
	('package_categories.delete', 'Delete package categories', 'Archive package categories.'),
	('packages.publish', 'Publish packages', 'Publish or archive commercial packages.')
ON CONFLICT ("code") WHERE "deleted_at" IS NULL DO UPDATE SET
	"name" = EXCLUDED."name",
	"description" = EXCLUDED."description",
	"updated_at" = now();
--> statement-breakpoint
INSERT INTO "platform_role_permissions" ("role_id", "permission_id")
SELECT roles."id", permissions."id"
FROM "platform_roles" roles
CROSS JOIN "platform_permissions" permissions
WHERE roles."code" IN ('super_admin', 'administrator', 'billing_manager')
	AND permissions."code" IN (
		'package_categories.view',
		'package_categories.create',
		'package_categories.update',
		'package_categories.delete',
		'packages.publish'
	)
	AND roles."deleted_at" IS NULL
	AND permissions."deleted_at" IS NULL
ON CONFLICT DO NOTHING;

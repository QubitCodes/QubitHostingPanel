ALTER TABLE "email_usage_products" ALTER COLUMN "monthly_price_minor" DROP NOT NULL;
--> statement-breakpoint
INSERT INTO "entitlement_definitions" ("code", "name", "description", "value_type", "unit", "enforcement_mode", "reset_period") VALUES
	('applications.count', 'Applications', 'Maximum deployed applications.', 'number', 'applications', 'hard', NULL),
	('databases.count', 'Databases', 'Maximum managed databases.', 'number', 'databases', 'hard', NULL),
	('storage.total_gb', 'Storage', 'Total application and database storage.', 'number', 'GB', 'hard', NULL),
	('domains.count', 'Domains', 'Maximum connected domains.', 'number', 'domains', 'hard', NULL),
	('backups.enabled', 'Backups', 'Automated backup availability.', 'boolean', NULL, 'hard', NULL),
	('backups.retention_days', 'Backup retention', 'Number of retained backup days.', 'number', 'days', 'hard', NULL),
	('compute.cpu_cores', 'CPU cores', 'Target compute allocation.', 'number', 'cores', 'informational', NULL),
	('compute.memory_mb', 'Memory', 'Target memory allocation.', 'number', 'MB', 'hard', NULL),
	('email.transactional_recipients_monthly', 'Transactional email recipients', 'Monthly Amazon SES recipient allowance.', 'number', 'recipients', 'hard', 'month')
ON CONFLICT ("code") WHERE "deleted_at" IS NULL DO UPDATE SET "name" = EXCLUDED."name", "description" = EXCLUDED."description", "unit" = EXCLUDED."unit", "enforcement_mode" = EXCLUDED."enforcement_mode", "reset_period" = EXCLUDED."reset_period", "updated_at" = now();
--> statement-breakpoint
INSERT INTO "email_usage_products" ("name", "slug", "included_recipients", "monthly_price_minor") VALUES
	('10K transactional recipients', 'ses-10k', 10000, 24900),
	('50K transactional recipients', 'ses-50k', 50000, 99900),
	('100K transactional recipients', 'ses-100k', 100000, 179900),
	('500K transactional recipients', 'ses-500k', 500000, NULL)
ON CONFLICT ("slug") WHERE "deleted_at" IS NULL DO UPDATE SET "name" = EXCLUDED."name", "included_recipients" = EXCLUDED."included_recipients", "monthly_price_minor" = EXCLUDED."monthly_price_minor", "updated_at" = now();
--> statement-breakpoint
INSERT INTO "package_entitlements" ("package_id", "entitlement_id", "numeric_value", "boolean_value")
SELECT package.id, definition.id,
	CASE WHEN definition.value_type = 'number' THEN seed.value::integer ELSE NULL END,
	CASE WHEN definition.value_type = 'boolean' THEN (seed.value::integer <> 0) ELSE NULL END
FROM (VALUES
	('launch', 'applications.count', 1), ('launch', 'databases.count', 1), ('launch', 'storage.total_gb', 5), ('launch', 'domains.count', 1), ('launch', 'backups.enabled', 1), ('launch', 'backups.retention_days', 7), ('launch', 'email.transactional_recipients_monthly', 2000),
	('growth', 'applications.count', 3), ('growth', 'databases.count', 2), ('growth', 'storage.total_gb', 15), ('growth', 'domains.count', 5), ('growth', 'backups.enabled', 1), ('growth', 'backups.retention_days', 14), ('growth', 'email.transactional_recipients_monthly', 10000),
	('business', 'applications.count', 8), ('business', 'databases.count', 5), ('business', 'storage.total_gb', 40), ('business', 'domains.count', 15), ('business', 'backups.enabled', 1), ('business', 'backups.retention_days', 30), ('business', 'email.transactional_recipients_monthly', 30000),
	('cloud-2-gb', 'applications.count', 10), ('cloud-2-gb', 'databases.count', 5), ('cloud-2-gb', 'storage.total_gb', 50), ('cloud-2-gb', 'domains.count', 20), ('cloud-2-gb', 'compute.cpu_cores', 2), ('cloud-2-gb', 'compute.memory_mb', 2048), ('cloud-2-gb', 'email.transactional_recipients_monthly', 20000),
	('cloud-4-gb', 'applications.count', 20), ('cloud-4-gb', 'databases.count', 10), ('cloud-4-gb', 'storage.total_gb', 100), ('cloud-4-gb', 'domains.count', 40), ('cloud-4-gb', 'compute.cpu_cores', 4), ('cloud-4-gb', 'compute.memory_mb', 4096), ('cloud-4-gb', 'email.transactional_recipients_monthly', 50000),
	('cloud-8-gb', 'applications.count', 40), ('cloud-8-gb', 'databases.count', 20), ('cloud-8-gb', 'storage.total_gb', 200), ('cloud-8-gb', 'domains.count', 80), ('cloud-8-gb', 'compute.cpu_cores', 8), ('cloud-8-gb', 'compute.memory_mb', 8192), ('cloud-8-gb', 'email.transactional_recipients_monthly', 100000)
) AS seed(package_slug, entitlement_code, value)
JOIN "packages" package ON package.slug = seed.package_slug AND package.deleted_at IS NULL
JOIN "entitlement_definitions" definition ON definition.code = seed.entitlement_code AND definition.deleted_at IS NULL
ON CONFLICT ("package_id", "entitlement_id") WHERE "deleted_at" IS NULL DO UPDATE SET "numeric_value" = EXCLUDED."numeric_value", "boolean_value" = EXCLUDED."boolean_value", "updated_at" = now();

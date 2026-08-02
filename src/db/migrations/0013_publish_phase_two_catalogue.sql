INSERT INTO "package_prices" ("package_id", "currency", "billing_interval", "interval_count", "amount_minor", "tax_behavior", "is_active", "is_public")
SELECT monthly.package_id, monthly.currency, 'year'::"price_billing_interval", term.interval_count, monthly.amount_minor * term.months, monthly.tax_behavior, true, false
FROM "package_prices" monthly
CROSS JOIN (VALUES (2, 20), (3, 30)) AS term(interval_count, months)
WHERE monthly.billing_interval = 'month'
	AND monthly.interval_count = 1
	AND monthly.is_active = true
	AND monthly.deleted_at IS NULL
	AND NOT EXISTS (
		SELECT 1 FROM "package_prices" existing
		WHERE existing.package_id = monthly.package_id
			AND existing.currency = monthly.currency
			AND existing.billing_interval = 'year'
			AND existing.interval_count = term.interval_count
			AND existing.is_active = true
			AND existing.deleted_at IS NULL
	);
--> statement-breakpoint
INSERT INTO "package_cost_reviews" ("package_id", "estimated_monthly_cost_minor", "revenue_minor", "margin_basis_points", "status", "notes", "reviewed_at")
SELECT package.id, review.cost_minor, review.revenue_minor,
	round(((review.revenue_minor - review.cost_minor)::numeric / review.revenue_minor) * 10000)::integer,
	'approved'::"cost_review_status", review.notes, now()
FROM (VALUES
	('launch', 18000, 39900, 'Pooled Mumbai capacity allocation including EC2, gp3, S3 backup, SES recipient allowance, transfer, monitoring, support, payment-fee and contingency assumptions.'),
	('growth', 35000, 79900, 'Pooled Mumbai capacity allocation including EC2, gp3, S3 backup, SES recipient allowance, transfer, monitoring, support, payment-fee and contingency assumptions.'),
	('business', 70000, 149900, 'Pooled Mumbai capacity allocation including EC2, gp3, S3 backup, SES recipient allowance, transfer, monitoring, support, payment-fee and contingency assumptions.')
) AS review(package_slug, cost_minor, revenue_minor, notes)
JOIN "packages" package ON package.slug = review.package_slug AND package.deleted_at IS NULL
WHERE NOT EXISTS (
	SELECT 1 FROM "package_cost_reviews" existing
	WHERE existing.package_id = package.id
		AND existing.status = 'approved'
		AND existing.revenue_minor = review.revenue_minor
		AND existing.deleted_at IS NULL
);
--> statement-breakpoint
UPDATE "package_prices" price
SET "is_public" = true, "updated_at" = now()
FROM "packages" package
WHERE package.id = price.package_id
	AND package.slug IN ('launch', 'growth', 'business')
	AND price.is_active = true
	AND price.deleted_at IS NULL;
--> statement-breakpoint
UPDATE "packages"
SET "status" = 'published', "published_at" = now(), "updated_at" = now()
WHERE "slug" IN ('launch', 'growth', 'business')
	AND "deleted_at" IS NULL;

import { Client } from 'pg';

import { getEnvironment } from '@config/env';

interface PackageDeploymentRow {
	active_prices: number;
	public_prices: number;
	slug: string;
	status: 'archived' | 'draft' | 'published';
	terms: string[] | null;
}

/** Verifies the deployed Phase 2 commerce schema and safe initial catalogue. */
async function verifyPhase2Deployment(): Promise<void> {
	const client = new Client({ connectionString: getEnvironment().DATABASE_URL });

	try {
		await client.connect();

		const tableResult = await client.query<{ table_name: string }>(`
			SELECT table_name
			FROM information_schema.tables
			WHERE table_schema = 'public'
				AND table_name IN ('offers', 'offer_eligible_prices', 'offer_eligible_terms', 'offer_redemptions', 'package_cost_reviews')
			ORDER BY table_name
		`);
		const packageResult = await client.query<PackageDeploymentRow>(`
			SELECT
				package.slug,
				package.status,
				COUNT(price.id)::integer AS active_prices,
				COUNT(price.id) FILTER (WHERE price.is_public)::integer AS public_prices,
				ARRAY_AGG(CONCAT(price.billing_interval, ':', price.interval_count)
					ORDER BY price.billing_interval, price.interval_count)
					FILTER (WHERE price.id IS NOT NULL) AS terms
			FROM packages package
			LEFT JOIN package_prices price
				ON price.package_id = package.id
				AND price.is_active = true
				AND price.deleted_at IS NULL
			WHERE package.deleted_at IS NULL
			GROUP BY package.id, package.slug, package.status
			ORDER BY package.display_order, package.slug
		`);
		const reviewResult = await client.query<{ slug: string }>(`
			SELECT DISTINCT package.slug
			FROM package_cost_reviews review
			JOIN packages package ON package.id = review.package_id
			WHERE review.status = 'approved'
				AND review.deleted_at IS NULL
				AND package.slug IN ('launch', 'growth', 'business')
			ORDER BY package.slug
		`);

		const expectedTables = ['offer_eligible_prices', 'offer_eligible_terms', 'offer_redemptions', 'offers', 'package_cost_reviews'];
		const deployedTables = tableResult.rows.map((row) => row.table_name);
		if (JSON.stringify(deployedTables) !== JSON.stringify(expectedTables)) {
			throw new Error(`Phase 2 tables are incomplete: ${deployedTables.join(', ')}`);
		}

		const publicSlugs = new Set(['launch', 'growth', 'business']);
		for (const packageRow of packageResult.rows) {
			const expectedPublic = publicSlugs.has(packageRow.slug);
			const terms = new Set(packageRow.terms ?? []);
			const hasAllTerms = ['month:1', 'year:1', 'year:2', 'year:3'].every((term) => terms.has(term));
			if (!hasAllTerms || packageRow.active_prices !== 4) {
				throw new Error(`${packageRow.slug} does not have exactly four active billing terms.`);
			}
			if (expectedPublic && (packageRow.status !== 'published' || packageRow.public_prices !== 4)) {
				throw new Error(`${packageRow.slug} is not fully published.`);
			}
			if (!expectedPublic && (packageRow.status !== 'draft' || packageRow.public_prices !== 0)) {
				throw new Error(`${packageRow.slug} must remain private and draft.`);
			}
		}

		const approvedReviews = reviewResult.rows.map((row) => row.slug).sort();
		if (JSON.stringify(approvedReviews) !== JSON.stringify(['business', 'growth', 'launch'])) {
			throw new Error('The initial public packages do not all have approved cost reviews.');
		}

		console.info(JSON.stringify({
			approvedCostReviews: approvedReviews,
			packages: packageResult.rows,
			tables: deployedTables,
		}));
	} finally {
		await client.end();
	}
}

await verifyPhase2Deployment();

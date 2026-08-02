import { describe, expect, it } from 'vitest';

import {
	createPackageCategorySchema,
	createPackageSchema,
	packageSlugSchema,
	setPackagePricesSchema,
} from '@schemas/package';

const validPackage = {
	categoryId: null,
	description: 'Managed hosting package.',
	displayOrder: 0,
	isFeatured: false,
	name: 'Shared Starter',
	slug: 'shared-starter',
	status: 'draft' as const,
	trialDuration: null,
	trialDurationUnit: null,
	trialEnabled: false,
};

describe('package catalogue validation', () => {
	it('accepts a package without a category or trial', () => {
		expect(createPackageSchema.safeParse(validPackage).success).toBe(true);
	});

	it('requires a positive duration and unit for enabled trials', () => {
		expect(
			createPackageSchema.safeParse({
				...validPackage,
				trialEnabled: true,
			}).success,
		).toBe(false);
		expect(
			createPackageSchema.safeParse({
				...validPackage,
				trialDuration: 2,
				trialDurationUnit: 'week',
				trialEnabled: true,
			}).success,
		).toBe(true);
	});

	it('rejects retained trial fields when trial is disabled', () => {
		expect(
			createPackageSchema.safeParse({
				...validPackage,
				trialDuration: 14,
				trialDurationUnit: 'day',
			}).success,
		).toBe(false);
	});

	it('enforces human-readable slugs for packages and categories', () => {
		expect(packageSlugSchema.safeParse('vps-pro-2').success).toBe(true);
		expect(packageSlugSchema.safeParse('VPS Pro').success).toBe(false);
		expect(
			createPackageCategorySchema.safeParse({
				displayOrder: 0,
				name: 'VPS Hosting',
				slug: 'vps-hosting',
			}).success,
		).toBe(true);
	});

	it('validates positive INR monthly and yearly prices', () => {
		expect(setPackagePricesSchema.safeParse({ currency: 'INR', monthlyAmount: 399, yearlyAmount: 3990, taxBehavior: 'exclusive', isPublic: false }).success).toBe(true);
		expect(setPackagePricesSchema.safeParse({ currency: 'INR', monthlyAmount: 0, yearlyAmount: 3990, taxBehavior: 'exclusive', isPublic: false }).success).toBe(false);
	});
});

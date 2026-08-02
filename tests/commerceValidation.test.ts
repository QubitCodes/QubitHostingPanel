import { describe, expect, it } from 'vitest';
import { checkoutQuoteSchema } from '@schemas/checkout';
import { createOfferSchema } from '@schemas/offer';
import { setPackageEntitlementsSchema } from '@schemas/package';

const offer = { name: 'Launch offer', slug: 'launch-offer', description: null, couponCode: 'LAUNCH10', discountType: 'percentage' as const, percentage: 10, fixedAmount: null, currency: 'INR' as const, status: 'active' as const, startsAt: null, endsAt: null, newCustomerOnly: false, maxRedemptions: 100, maxRedemptionsPerCustomer: 1, stackable: false, priority: 10, packageIds: [], priceIds: [] };

describe('commercial validation', () => {
	it('requires matching offer discount values', () => {
		expect(createOfferSchema.safeParse(offer).success).toBe(true);
		expect(createOfferSchema.safeParse({ ...offer, fixedAmount: 100 }).success).toBe(false);
	});
	it('accepts identifier-only checkout quotes', () => {
		expect(checkoutQuoteSchema.safeParse({ priceId: '00000000-0000-4000-8000-000000000000', couponCode: 'SAVE10' }).success).toBe(true);
		expect(checkoutQuoteSchema.safeParse({ priceId: 'bad', total: 1 }).success).toBe(false);
	});
	it('enforces one entitlement value or unlimited', () => {
		const entitlementId = '00000000-0000-4000-8000-000000000000';
		expect(setPackageEntitlementsSchema.safeParse({ items: [{ entitlementId, numericValue: 5, booleanValue: null, isUnlimited: false }] }).success).toBe(true);
		expect(setPackageEntitlementsSchema.safeParse({ items: [{ entitlementId, numericValue: 5, booleanValue: true, isUnlimited: false }] }).success).toBe(false);
	});
});

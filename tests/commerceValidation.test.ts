import { describe, expect, it } from 'vitest';
import { checkoutQuoteSchema, configureCheckoutWorkspaceSchema, purchaseCheckoutSchema } from '@schemas/checkout';
import { createOfferSchema } from '@schemas/offer';
import { setPackageEntitlementsSchema } from '@schemas/package';

const offer = { name: 'Launch offer', slug: 'launch-offer', description: null, couponCode: 'LAUNCH10', discountType: 'percentage' as const, percentage: 10, fixedAmount: null, currency: 'INR' as const, status: 'active' as const, startsAt: null, endsAt: null, customerEligibility: 'everyone' as const, subscriptionEvent: 'both' as const, discountRecurrence: 'once' as const, recurrenceCycles: null, trialHandling: 'after_trial' as const, minimumSubtotal: null, maximumDiscount: 500, maxRedemptions: 100, maxRedemptionsPerCustomer: 1, stackable: false, priority: 10, packageIds: [], priceIds: [], eligibleTerms: [{ billingInterval: 'month' as const, intervalCount: 1 }] };

describe('commercial validation', () => {
	it('requires matching offer discount values', () => {
		expect(createOfferSchema.safeParse(offer).success).toBe(true);
		expect(createOfferSchema.safeParse({ ...offer, fixedAmount: 100 }).success).toBe(false);
	});
	it('validates duration and recurrence configuration', () => {
		expect(createOfferSchema.safeParse({ ...offer, discountRecurrence: 'cycles', recurrenceCycles: 3 }).success).toBe(true);
		expect(createOfferSchema.safeParse({ ...offer, discountRecurrence: 'cycles', recurrenceCycles: null }).success).toBe(false);
		expect(createOfferSchema.safeParse({ ...offer, eligibleTerms: [{ billingInterval: 'year', intervalCount: 2 }] }).success).toBe(true);
		expect(createOfferSchema.safeParse({ ...offer, eligibleTerms: [{ billingInterval: 'month', intervalCount: 1 }, { billingInterval: 'month', intervalCount: 1 }] }).success).toBe(false);
	});
	it('accepts identifier-only checkout quotes', () => {
		expect(checkoutQuoteSchema.safeParse({ priceId: '00000000-0000-4000-8000-000000000000', couponCode: 'SAVE10' }).success).toBe(true);
		expect(checkoutQuoteSchema.safeParse({ priceId: 'bad', total: 1 }).success).toBe(false);
	});
	it('validates purchase tokens and post-purchase workspace setup', () => {
		const billingProfile = { displayName: 'Qubit Codes', contactEmail: 'billing@example.com', addressLine1: '42 Green Road', city: 'Kolkata', region: 'West Bengal', postalCode: '700001', countryCode: 'IN' };
		expect(purchaseCheckoutSchema.safeParse({ quoteToken: 'x'.repeat(32) }).success).toBe(true);
		expect(configureCheckoutWorkspaceSchema.safeParse({ name: 'Production', type: 'personal', organisation: null, billingProfile }).success).toBe(true);
		expect(configureCheckoutWorkspaceSchema.safeParse({ name: 'Production', type: 'personal', organisation: null }).success).toBe(false);
		expect(configureCheckoutWorkspaceSchema.safeParse({ name: 'Company', type: 'organisation', organisation: null, billingProfile }).success).toBe(false);
		expect(configureCheckoutWorkspaceSchema.safeParse({ name: 'Company', type: 'organisation', organisation: { displayName: 'Qubit Codes', legalName: null }, billingProfile }).success).toBe(true);
	});
	it('enforces one entitlement value or unlimited', () => {
		const entitlementId = '00000000-0000-4000-8000-000000000000';
		expect(setPackageEntitlementsSchema.safeParse({ items: [{ entitlementId, numericValue: 5, booleanValue: null, isUnlimited: false }] }).success).toBe(true);
		expect(setPackageEntitlementsSchema.safeParse({ items: [{ entitlementId, numericValue: 5, booleanValue: true, isUnlimited: false }] }).success).toBe(false);
	});
});

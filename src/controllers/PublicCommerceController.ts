import { SignJWT } from 'jose';
import { and, asc, count, desc, eq, gt, isNull, lte, or } from 'drizzle-orm';
import { resp } from '@qubitcodes/qcresp';

import { getEnvironment } from '@config/env';
import { db } from '@db/client';
import { entitlementDefinitions, offerEligiblePrices, offerEligibleTerms, offerRedemptions, offers, packageCategories, packageEntitlements, packagePrices, packages } from '@db/schema';
import type { CheckoutQuoteInput } from '@schemas/checkout';

function availableNow() { const now = new Date(); return and(eq(offers.status, 'active'), or(isNull(offers.startsAt), lte(offers.startsAt, now)), or(isNull(offers.endsAt), gt(offers.endsAt, now)), isNull(offers.deletedAt)); }

/** Public commercial reads and server-authoritative signed checkout quotations. */
export class PublicCommerceController {
	public static async catalogue(): Promise<Response> {
		try {
			const rows = await db.select({ id: packages.id, name: packages.name, slug: packages.slug, description: packages.description, categoryName: packageCategories.name, isFeatured: packages.isFeatured, trialEnabled: packages.trialEnabled, trialDuration: packages.trialDuration, trialDurationUnit: packages.trialDurationUnit }).from(packages).leftJoin(packageCategories, and(eq(packageCategories.id, packages.categoryId), isNull(packageCategories.deletedAt))).where(and(eq(packages.status, 'published'), isNull(packages.deletedAt))).orderBy(asc(packages.displayOrder), asc(packages.name));
			const data = await Promise.all(rows.map(async (record) => {
				const prices = await db.select({ id: packagePrices.id, currency: packagePrices.currency, billingInterval: packagePrices.billingInterval, intervalCount: packagePrices.intervalCount, amountMinor: packagePrices.amountMinor, taxBehavior: packagePrices.taxBehavior }).from(packagePrices).where(and(eq(packagePrices.packageId, record.id), eq(packagePrices.isActive, true), eq(packagePrices.isPublic, true), isNull(packagePrices.deletedAt))).orderBy(asc(packagePrices.billingInterval), asc(packagePrices.intervalCount));
				const entitlements = await db.select({ code: entitlementDefinitions.code, name: entitlementDefinitions.name, unit: entitlementDefinitions.unit, numericValue: packageEntitlements.numericValue, booleanValue: packageEntitlements.booleanValue, isUnlimited: packageEntitlements.isUnlimited }).from(packageEntitlements).innerJoin(entitlementDefinitions, eq(entitlementDefinitions.id, packageEntitlements.entitlementId)).where(and(eq(packageEntitlements.packageId, record.id), eq(entitlementDefinitions.isCustomerVisible, true), isNull(packageEntitlements.deletedAt), isNull(entitlementDefinitions.deletedAt))).orderBy(asc(entitlementDefinitions.code));
				return { ...record, prices, entitlements };
			}));
			return resp.success('Public package catalogue retrieved.', data);
		} catch (error) { console.error('Public catalogue failed.', error); return resp.failure('Unable to retrieve the package catalogue.', resp.codes.DATABASE_ERROR, undefined, null, undefined, 500); }
	}

	public static async quote(input: CheckoutQuoteInput): Promise<Response> {
		try {
			const [price] = await db.select({ id: packagePrices.id, packageId: packages.id, packageSlug: packages.slug, packageName: packages.name, trialEnabled: packages.trialEnabled, amountMinor: packagePrices.amountMinor, currency: packagePrices.currency, billingInterval: packagePrices.billingInterval, intervalCount: packagePrices.intervalCount, taxBehavior: packagePrices.taxBehavior }).from(packagePrices).innerJoin(packages, eq(packages.id, packagePrices.packageId)).where(and(eq(packagePrices.id, input.priceId), eq(packagePrices.isActive, true), eq(packagePrices.isPublic, true), eq(packages.status, 'published'), isNull(packagePrices.deletedAt), isNull(packages.deletedAt))).limit(1);
			if (!price) return resp.failure('Package price not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
			const candidates = await db.select().from(offers).where(input.couponCode ? and(availableNow(), eq(offers.couponCode, input.couponCode.toUpperCase())) : and(availableNow(), isNull(offers.couponCode))).orderBy(desc(offers.priority));
			const applicable = [] as typeof candidates;
			for (const offer of candidates) {
				if (offer.customerEligibility !== 'everyone' || offer.subscriptionEvent === 'renewal') continue;
				if (offer.trialHandling === 'exclude_trial' && price.trialEnabled) continue;
				if (offer.minimumSubtotalMinor !== null && price.amountMinor < offer.minimumSubtotalMinor) continue;
				const eligibility = await db.select({ id: offerEligiblePrices.id }).from(offerEligiblePrices).where(and(eq(offerEligiblePrices.offerId, offer.id), or(eq(offerEligiblePrices.packageId, price.packageId), eq(offerEligiblePrices.priceId, price.id)), isNull(offerEligiblePrices.deletedAt))).limit(1);
				const [eligibilityCount] = await db.select({ value: count() }).from(offerEligiblePrices).where(and(eq(offerEligiblePrices.offerId, offer.id), isNull(offerEligiblePrices.deletedAt)));
				if (Number(eligibilityCount?.value ?? 0) > 0 && !eligibility.length) continue;
				const [termCount] = await db.select({ value: count() }).from(offerEligibleTerms).where(and(eq(offerEligibleTerms.offerId, offer.id), isNull(offerEligibleTerms.deletedAt)));
				if (Number(termCount?.value ?? 0) > 0) {
					const [term] = await db.select({ id: offerEligibleTerms.id }).from(offerEligibleTerms).where(and(eq(offerEligibleTerms.offerId, offer.id), eq(offerEligibleTerms.billingInterval, price.billingInterval), eq(offerEligibleTerms.intervalCount, price.intervalCount), isNull(offerEligibleTerms.deletedAt))).limit(1);
					if (!term) continue;
				}
				const [redemptions] = await db.select({ value: count() }).from(offerRedemptions).where(and(eq(offerRedemptions.offerId, offer.id), isNull(offerRedemptions.deletedAt)));
				if (offer.maxRedemptions !== null && Number(redemptions?.value ?? 0) >= offer.maxRedemptions) continue;
				applicable.push(offer);
			}
			if (input.couponCode && !applicable.length) return resp.failure('Coupon is invalid, expired, or not eligible for this price.', resp.codes.GENERAL_BUSINESS_LOGIC_ERROR, undefined, null, undefined, 422);
			let remaining = price.amountMinor; const appliedOffers: Array<{ id: string; name: string; discountMinor: number; recurrence: string; recurrenceCycles: number | null }> = [];
			for (const offer of applicable) {
				const calculated = offer.discountType === 'percentage' ? Math.round(remaining * (offer.percentageBasisPoints ?? 0) / 10_000) : offer.fixedAmountMinor ?? 0;
				const capped = offer.maximumDiscountMinor === null ? calculated : Math.min(calculated, offer.maximumDiscountMinor);
				const discount = Math.min(remaining, capped);
				if (discount <= 0) continue; appliedOffers.push({ id: offer.id, name: offer.name, discountMinor: discount, recurrence: offer.discountRecurrence, recurrenceCycles: offer.recurrenceCycles }); remaining -= discount; if (!offer.stackable) break;
			}
			const environment = getEnvironment(); if (!environment.CHECKOUT_SIGNING_SECRET) throw new Error('CHECKOUT_SIGNING_SECRET is not configured.');
			const taxMinor = price.taxBehavior === 'inclusive' ? 0 : Math.round(remaining * environment.CHECKOUT_TAX_RATE_BPS / 10_000); const totalMinor = remaining + taxMinor;
			const quoteId = crypto.randomUUID(); const expiresAt = new Date(Date.now() + environment.CHECKOUT_QUOTE_TTL_MINUTES * 60_000);
			const payload = { quoteId, priceId: price.id, packageId: price.packageId, currency: price.currency, subtotalMinor: price.amountMinor, discountMinor: price.amountMinor - remaining, taxMinor, totalMinor, appliedOfferIds: appliedOffers.map(({ id }) => id) };
			const token = await new SignJWT(payload).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setIssuedAt().setExpirationTime(Math.floor(expiresAt.getTime() / 1000)).setIssuer('qubit-hosting-panel').setAudience('qubit-hosting-checkout').setJti(quoteId).sign(new TextEncoder().encode(environment.CHECKOUT_SIGNING_SECRET));
			return resp.success('Checkout quote created.', { ...payload, packageSlug: price.packageSlug, packageName: price.packageName, billingInterval: price.billingInterval, intervalCount: price.intervalCount, trialEnabled: price.trialEnabled, appliedOffers, expiresAt: expiresAt.toISOString(), token }, resp.codes.CREATED, undefined, 201);
		} catch (error) { console.error('Checkout quote failed.', error); return resp.failure('Unable to create checkout quote.', resp.codes.GENERAL_SERVER_ERROR, undefined, null, undefined, 500); }
	}
}

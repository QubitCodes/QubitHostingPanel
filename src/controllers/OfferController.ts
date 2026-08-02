import { and, asc, eq, isNull } from 'drizzle-orm';
import { resp } from '@qubitcodes/qcresp';

import { db } from '@db/client';
import { offerEligiblePrices, offerEligibleTerms, offers } from '@db/schema';
import type { OfferInput } from '@schemas/offer';
import { recordAuditLog } from '@services/auditLogService';
import { authorizeAdmin } from '@services/authorization/adminAuthorizationService';
import type { RequestMetadata } from '@utils/request';

function failure(error: unknown): Response {
	const message = error instanceof Error ? error.message : '';
	if (message.includes('Authentication') || message.includes('Session')) return resp.failure('Authentication required.', resp.codes.AUTHENTICATION_ERROR, undefined, null, undefined, 401);
	if (message.includes('Permission') || message.includes('Admin context')) return resp.failure('Permission denied.', resp.codes.PERMISSION_DENIED, undefined, null, undefined, 403);
	console.error('Offer operation failed.', error);
	return resp.failure('Unable to complete the offer request.', resp.codes.DATABASE_ERROR, undefined, null, undefined, 500);
}

function values(input: OfferInput) {
	return { name: input.name, slug: input.slug, description: input.description, couponCode: input.couponCode?.toUpperCase() ?? null, discountType: input.discountType, percentageBasisPoints: input.percentage === null ? null : Math.round(input.percentage * 100), fixedAmountMinor: input.fixedAmount === null ? null : Math.round(input.fixedAmount * 100), currency: input.currency, status: input.status, startsAt: input.startsAt ? new Date(input.startsAt) : null, endsAt: input.endsAt ? new Date(input.endsAt) : null, customerEligibility: input.customerEligibility, subscriptionEvent: input.subscriptionEvent, discountRecurrence: input.discountRecurrence, recurrenceCycles: input.recurrenceCycles, trialHandling: input.trialHandling, minimumSubtotalMinor: input.minimumSubtotal === null ? null : Math.round(input.minimumSubtotal * 100), maximumDiscountMinor: input.maximumDiscount === null ? null : Math.round(input.maximumDiscount * 100), maxRedemptions: input.maxRedemptions, maxRedemptionsPerCustomer: input.maxRedemptionsPerCustomer, stackable: input.stackable, priority: input.priority, updatedAt: new Date() };
}

async function replaceEligibility(offerId: string, input: OfferInput): Promise<void> {
	await db.transaction(async (transaction) => {
		await transaction.update(offerEligiblePrices).set({ deletedAt: new Date(), deleteReason: 'Offer eligibility replaced.', updatedAt: new Date() }).where(and(eq(offerEligiblePrices.offerId, offerId), isNull(offerEligiblePrices.deletedAt)));
		await transaction.update(offerEligibleTerms).set({ deletedAt: new Date(), deleteReason: 'Offer term eligibility replaced.', updatedAt: new Date() }).where(and(eq(offerEligibleTerms.offerId, offerId), isNull(offerEligibleTerms.deletedAt)));
		const entries = [...input.packageIds.map((packageId) => ({ offerId, packageId })), ...input.priceIds.map((priceId) => ({ offerId, priceId }))];
		if (entries.length) await transaction.insert(offerEligiblePrices).values(entries);
		if (input.eligibleTerms.length) await transaction.insert(offerEligibleTerms).values(input.eligibleTerms.map((term) => ({ offerId, ...term })));
	});
}

/** Offer and coupon administration. */
export class OfferController {
	public static async index(request: Request, metadata: RequestMetadata): Promise<Response> { try { await authorizeAdmin(request, 'offers.view', metadata); return resp.success('Offers retrieved.', await db.select().from(offers).where(isNull(offers.deletedAt)).orderBy(asc(offers.priority), asc(offers.name))); } catch (error) { return failure(error); } }
	public static async show(request: Request, slug: string, metadata: RequestMetadata): Promise<Response> { try { await authorizeAdmin(request, 'offers.view', metadata); const [offer] = await db.select().from(offers).where(and(eq(offers.slug, slug), isNull(offers.deletedAt))).limit(1); if (!offer) return resp.failure('Offer not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); const [eligibility, terms] = await Promise.all([db.select().from(offerEligiblePrices).where(and(eq(offerEligiblePrices.offerId, offer.id), isNull(offerEligiblePrices.deletedAt))), db.select({ billingInterval: offerEligibleTerms.billingInterval, intervalCount: offerEligibleTerms.intervalCount }).from(offerEligibleTerms).where(and(eq(offerEligibleTerms.offerId, offer.id), isNull(offerEligibleTerms.deletedAt)))]); return resp.success('Offer retrieved.', { ...offer, minimumSubtotal: offer.minimumSubtotalMinor === null ? null : offer.minimumSubtotalMinor / 100, maximumDiscount: offer.maximumDiscountMinor === null ? null : offer.maximumDiscountMinor / 100, packageIds: eligibility.flatMap((item) => item.packageId ? [item.packageId] : []), priceIds: eligibility.flatMap((item) => item.priceId ? [item.priceId] : []), eligibleTerms: terms }); } catch (error) { return failure(error); } }
	public static async create(request: Request, input: OfferInput, metadata: RequestMetadata): Promise<Response> { try { const actor = await authorizeAdmin(request, 'offers.create', metadata); const [offer] = await db.insert(offers).values(values(input)).returning(); await replaceEligibility(offer.id, input); await recordAuditLog({ actorUserId: actor.userId, action: 'offer.created', resourceType: 'offer', resourceId: offer.id, metadata: { slug: offer.slug }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent }); return resp.success('Offer created.', offer, resp.codes.CREATED, undefined, 201); } catch (error) { return failure(error); } }
	public static async update(request: Request, slug: string, input: OfferInput, metadata: RequestMetadata): Promise<Response> { try { const actor = await authorizeAdmin(request, 'offers.update', metadata); const [offer] = await db.update(offers).set(values(input)).where(and(eq(offers.slug, slug), isNull(offers.deletedAt))).returning(); if (!offer) return resp.failure('Offer not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); await replaceEligibility(offer.id, input); await recordAuditLog({ actorUserId: actor.userId, action: 'offer.updated', resourceType: 'offer', resourceId: offer.id, metadata: { slug: offer.slug }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent }); return resp.success('Offer updated.', offer, resp.codes.UPDATED); } catch (error) { return failure(error); } }
	public static async remove(request: Request, slug: string, metadata: RequestMetadata): Promise<Response> { try { const actor = await authorizeAdmin(request, 'offers.delete', metadata); const [offer] = await db.update(offers).set({ deletedAt: new Date(), deleteReason: 'Deleted from offer administration.', status: 'archived', updatedAt: new Date() }).where(and(eq(offers.slug, slug), isNull(offers.deletedAt))).returning(); if (!offer) return resp.failure('Offer not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); await recordAuditLog({ actorUserId: actor.userId, action: 'offer.deleted', resourceType: 'offer', resourceId: offer.id, metadata: { slug }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent }); return resp.success('Offer deleted.'); } catch (error) { return failure(error); } }
}

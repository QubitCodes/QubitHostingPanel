import { jwtVerify } from 'jose';
import { and, eq, isNull } from 'drizzle-orm';
import { resp } from '@qubitcodes/qcresp';

import { getEnvironment } from '@config/env';
import { db } from '@db/client';
import { customerCheckouts, customers, entitlementDefinitions, organisations, packageEntitlements, packagePrices, packages, workspaceMemberships, workspaces, workspaceSubscriptions } from '@db/schema';
import type { ConfigureCheckoutWorkspaceInput, PurchaseCheckoutInput } from '@schemas/checkout';
import { authenticateSession } from '@services/auth/authenticatedSessionService';
import { ensureCustomer } from '@services/customerWorkspaceService';
import type { RequestMetadata } from '@utils/request';

interface QuotePayload { appliedOfferIds: string[]; currency: string; discountMinor: number; packageId: string; priceId: string; subtotalMinor: number; taxMinor: number; totalMinor: number }

function addTerm(date: Date, interval: 'month' | 'year', count: number): Date {
	const result = new Date(date);
	if (interval === 'month') result.setUTCMonth(result.getUTCMonth() + count);
	else result.setUTCFullYear(result.getUTCFullYear() + count);
	return result;
}

function addTrial(date: Date, duration: number, unit: 'day' | 'week' | 'month'): Date {
	const result = new Date(date);
	if (unit === 'month') result.setUTCMonth(result.getUTCMonth() + duration);
	else result.setUTCDate(result.getUTCDate() + duration * (unit === 'week' ? 7 : 1));
	return result;
}

/** Persists a signed purchase and configures its workspace only after purchase completion. */
export class CheckoutController {
	public static async purchase(request: Request, input: PurchaseCheckoutInput, metadata: RequestMetadata): Promise<Response> {
		try {
			const authenticated = await authenticateSession(request, metadata);
			const environment = getEnvironment();
			if (!environment.CHECKOUT_SIGNING_SECRET) throw new Error('Checkout signing is unavailable.');
			const verified = await jwtVerify(input.quoteToken, new TextEncoder().encode(environment.CHECKOUT_SIGNING_SECRET), { issuer: 'qubit-hosting-panel', audience: 'qubit-hosting-checkout' });
			const quote = verified.payload as unknown as QuotePayload;
			const [price] = await db.select({ billingInterval: packagePrices.billingInterval, currency: packagePrices.currency, id: packagePrices.id, intervalCount: packagePrices.intervalCount, packageId: packages.id, packageName: packages.name }).from(packagePrices).innerJoin(packages, eq(packages.id, packagePrices.packageId)).where(and(eq(packagePrices.id, quote.priceId), eq(packages.id, quote.packageId), eq(packagePrices.isActive, true), eq(packages.status, 'published'), isNull(packagePrices.deletedAt), isNull(packages.deletedAt))).limit(1);
			if (!price) return resp.failure('The selected package price is no longer available.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
			const checkout = await db.transaction(async (transaction) => {
				const { customerId } = await ensureCustomer(transaction, authenticated.userId);
				const [created] = await transaction.insert(customerCheckouts).values({ customerId, packageId: price.packageId, priceId: price.id, packageNameSnapshot: price.packageName, currency: quote.currency, billingInterval: price.billingInterval, intervalCount: price.intervalCount, subtotalMinor: quote.subtotalMinor, discountMinor: quote.discountMinor, taxMinor: quote.taxMinor, totalMinor: quote.totalMinor, appliedOfferIds: quote.appliedOfferIds }).returning({ publicId: customerCheckouts.publicId });
				if (!created) throw new Error('Unable to persist checkout.');
				return created;
			});
			return resp.success('Purchase recorded. Configure the new workspace to continue.', { checkoutId: checkout.publicId, setupUrl: `/checkout/${checkout.publicId}/setup` }, resp.codes.CREATED, undefined, 201);
		} catch (error) {
			console.error('Checkout purchase failed.', error);
			return resp.failure('Unable to complete the purchase.', resp.codes.GENERAL_BUSINESS_LOGIC_ERROR, undefined, null, undefined, 422);
		}
	}

	public static async show(request: Request, publicId: number, metadata: RequestMetadata): Promise<Response> {
		try {
			const authenticated = await authenticateSession(request, metadata);
			const [checkout] = await db.select({ publicId: customerCheckouts.publicId, packageName: customerCheckouts.packageNameSnapshot, status: customerCheckouts.status, totalMinor: customerCheckouts.totalMinor, currency: customerCheckouts.currency }).from(customerCheckouts).innerJoin(customers, eq(customers.id, customerCheckouts.customerId)).where(and(eq(customerCheckouts.publicId, publicId), eq(customers.userId, authenticated.userId), isNull(customerCheckouts.deletedAt), isNull(customers.deletedAt))).limit(1);
			return checkout ? resp.success('Checkout retrieved.', checkout) : resp.failure('Checkout not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
		} catch { return resp.failure('Authentication required.', resp.codes.AUTHENTICATION_ERROR, undefined, null, undefined, 401); }
	}

	public static async configure(request: Request, publicId: number, input: ConfigureCheckoutWorkspaceInput, metadata: RequestMetadata): Promise<Response> {
		try {
			const authenticated = await authenticateSession(request, metadata);
			const result = await db.transaction(async (transaction) => {
				const [checkout] = await transaction.select().from(customerCheckouts).innerJoin(customers, eq(customers.id, customerCheckouts.customerId)).where(and(eq(customerCheckouts.publicId, publicId), eq(customerCheckouts.status, 'purchased'), eq(customers.userId, authenticated.userId), isNull(customerCheckouts.deletedAt), isNull(customers.deletedAt))).limit(1);
				if (!checkout) throw new Error('Checkout not found or already configured.');
				const now = new Date();
				const [workspace] = await transaction.insert(workspaces).values({ name: input.name, slug: `workspace-${publicId}`, type: input.type }).returning({ id: workspaces.id, publicId: workspaces.publicId });
				if (!workspace) throw new Error('Unable to create workspace.');
				await transaction.insert(workspaceMemberships).values({ workspaceId: workspace.id, customerId: checkout.customers.id, role: 'owner', status: 'active', joinedAt: now, ownershipStartedAt: now });
				if (input.type === 'organisation' && input.organisation) await transaction.insert(organisations).values({ workspaceId: workspace.id, displayName: input.organisation.displayName, legalName: input.organisation.legalName ?? null });
				const [plan] = await transaction.select().from(packages).where(eq(packages.id, checkout.customer_checkouts.packageId)).limit(1);
				if (!plan) throw new Error('Package snapshot unavailable.');
				const entitlements = await transaction.select({ code: entitlementDefinitions.code, name: entitlementDefinitions.name, numericValue: packageEntitlements.numericValue, booleanValue: packageEntitlements.booleanValue, isUnlimited: packageEntitlements.isUnlimited, unit: entitlementDefinitions.unit }).from(packageEntitlements).innerJoin(entitlementDefinitions, eq(entitlementDefinitions.id, packageEntitlements.entitlementId)).where(and(eq(packageEntitlements.packageId, plan.id), isNull(packageEntitlements.deletedAt), isNull(entitlementDefinitions.deletedAt)));
				const trialEndsAt = plan.trialEnabled && plan.trialDuration && plan.trialDurationUnit ? addTrial(now, plan.trialDuration, plan.trialDurationUnit) : null;
				await transaction.insert(workspaceSubscriptions).values({ workspaceId: workspace.id, checkoutId: checkout.customer_checkouts.id, packageId: plan.id, priceId: checkout.customer_checkouts.priceId, status: trialEndsAt ? 'trialing' : 'active', packageSnapshot: { id: plan.id, name: plan.name, description: plan.description, trialEnabled: plan.trialEnabled, trialDuration: plan.trialDuration, trialDurationUnit: plan.trialDurationUnit, currency: checkout.customer_checkouts.currency, billingInterval: checkout.customer_checkouts.billingInterval, intervalCount: checkout.customer_checkouts.intervalCount, subtotalMinor: checkout.customer_checkouts.subtotalMinor, discountMinor: checkout.customer_checkouts.discountMinor, taxMinor: checkout.customer_checkouts.taxMinor, totalMinor: checkout.customer_checkouts.totalMinor }, entitlementSnapshot: entitlements, startsAt: now, trialEndsAt, termEndsAt: addTerm(trialEndsAt ?? now, checkout.customer_checkouts.billingInterval, checkout.customer_checkouts.intervalCount) });
				await transaction.update(customerCheckouts).set({ workspaceId: workspace.id, status: 'configured', configuredAt: now, updatedAt: now }).where(eq(customerCheckouts.id, checkout.customer_checkouts.id));
				await transaction.update(customers).set({ onboardingStatus: 'complete', onboardingCompletedAt: now, updatedAt: now }).where(eq(customers.id, checkout.customers.id));
				return { workspaceId: workspace.publicId };
			});
			return resp.success('Workspace configured.', { ...result, dashboardUrl: '/dashboard' }, resp.codes.CREATED, undefined, 201);
		} catch (error) { console.error('Checkout configuration failed.', error); return resp.failure('Unable to configure the workspace.', resp.codes.GENERAL_BUSINESS_LOGIC_ERROR, undefined, null, undefined, 422); }
	}
}

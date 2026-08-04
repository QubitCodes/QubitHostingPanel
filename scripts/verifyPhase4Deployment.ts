import { and, eq } from 'drizzle-orm';

import { db } from '@db/client';
import { customerCheckouts, customers, packagePrices, packages, users, workspaceEntitlementOverrides, workspaceMemberships, workspaces, workspaceSubscriptions, workspaceUsageObservations, workspaceUsageReservations } from '@db/schema';
import { effectiveEntitlement, recordUsageObservation, reserveWorkspaceUsage } from '@services/usage/quotaEngine';

const suffix = `${Date.now()}`.slice(-9);
let userId: string | undefined; let customerId: string | undefined; let workspaceId: string | undefined; let checkoutId: string | undefined; let subscriptionId: string | undefined;

try {
	const [commercial] = await db.select({ packageId: packages.id, packageName: packages.name, priceId: packagePrices.id, currency: packagePrices.currency, billingInterval: packagePrices.billingInterval, intervalCount: packagePrices.intervalCount, amountMinor: packagePrices.amountMinor }).from(packagePrices).innerJoin(packages, eq(packages.id, packagePrices.packageId)).limit(1);
	if (!commercial) throw new Error('No commercial fixture is available.');
	const [user] = await db.insert(users).values({ mobile: `8${suffix}`, countryCode: '+91', displayName: 'Phase 4 live verification', status: 'active', mobileVerifiedAt: new Date() }).returning({ id: users.id }); userId = user?.id;
	if (!userId) throw new Error('Unable to create user fixture.');
	const [customer] = await db.insert(customers).values({ userId }).returning({ id: customers.id }); customerId = customer?.id;
	const [workspace] = await db.insert(workspaces).values({ name: 'Phase 4 live verification', slug: `phase-4-live-${suffix}`, type: 'personal' }).returning({ id: workspaces.id }); workspaceId = workspace?.id;
	if (!customerId || !workspaceId) throw new Error('Unable to create workspace fixture.');
	await db.insert(workspaceMemberships).values({ workspaceId, customerId, role: 'owner', status: 'active', ownershipStartedAt: new Date() });
	const [checkout] = await db.insert(customerCheckouts).values({ customerId, packageId: commercial.packageId, priceId: commercial.priceId, workspaceId, status: 'active', packageNameSnapshot: commercial.packageName, currency: commercial.currency, billingInterval: commercial.billingInterval, intervalCount: commercial.intervalCount, subtotalMinor: commercial.amountMinor, discountMinor: 0, taxMinor: 0, totalMinor: commercial.amountMinor, purchasedAt: new Date(), configuredAt: new Date() }).returning({ id: customerCheckouts.id }); checkoutId = checkout?.id;
	if (!checkoutId) throw new Error('Unable to create checkout fixture.');
	const [subscription] = await db.insert(workspaceSubscriptions).values({ workspaceId, checkoutId, packageId: commercial.packageId, priceId: commercial.priceId, status: 'active', isPrimary: true, packageSnapshot: { verification: true }, entitlementSnapshot: [{ code: 'applications.count', numericValue: 1, booleanValue: null, isUnlimited: false, enforcementMode: 'hard', isCustomerVisible: true }, { code: 'databases.storage.bytes', numericValue: 1048576, booleanValue: null, isUnlimited: false, enforcementMode: 'informational', isCustomerVisible: true }], termEndsAt: new Date(Date.now() + 86400000) }).returning({ id: workspaceSubscriptions.id }); subscriptionId = subscription?.id;
	if (!subscriptionId) throw new Error('Unable to create subscription fixture.');

	const decisions = await Promise.all([reserveWorkspaceUsage({ workspaceId, code: 'applications.count', current: 0, quantity: 1, idempotencyKey: `phase4-a-${suffix}` }), reserveWorkspaceUsage({ workspaceId, code: 'applications.count', current: 0, quantity: 1, idempotencyKey: `phase4-b-${suffix}` })]);
	if (decisions.filter((item) => item.allowed).length !== 1) throw new Error(`Hard-limit race failed: ${JSON.stringify(decisions)}`);

	await db.insert(workspaceEntitlementOverrides).values({ workspaceId, entitlementCode: 'applications.count', numericValue: 3, isUnlimited: false, enforcementMode: 'soft', reason: 'Phase 4 live verification.', createdByUserId: userId });
	const overridden = await effectiveEntitlement(workspaceId, 'applications.count');
	if (overridden.limit !== 3 || overridden.mode !== 'soft') throw new Error('Effective override verification failed.');

	const observedAt = new Date(Date.now() - 7200000); const staleAfter = new Date(Date.now() - 3600000);
	await recordUsageObservation({ workspaceId, code: 'databases.storage.bytes', value: 4096, unit: 'bytes', source: 'phase4-verifier', observedAt, staleAfter });
	const [observation] = await db.select().from(workspaceUsageObservations).where(and(eq(workspaceUsageObservations.workspaceId, workspaceId), eq(workspaceUsageObservations.entitlementCode, 'databases.storage.bytes'))).limit(1);
	if (!observation || observation.staleAfter > new Date()) throw new Error('Stale observation verification failed.');

	console.log(JSON.stringify({ concurrentHardLimit: { allowed: 1, denied: 1 }, override: { limit: overridden.limit, mode: overridden.mode }, observation: { value: observation.value, stale: true }, migration: '0027' }));
} finally {
	if (workspaceId) { await db.delete(workspaceUsageReservations).where(eq(workspaceUsageReservations.workspaceId, workspaceId)); await db.delete(workspaceUsageObservations).where(eq(workspaceUsageObservations.workspaceId, workspaceId)); await db.delete(workspaceEntitlementOverrides).where(eq(workspaceEntitlementOverrides.workspaceId, workspaceId)); }
	if (subscriptionId) await db.delete(workspaceSubscriptions).where(eq(workspaceSubscriptions.id, subscriptionId));
	if (workspaceId) await db.delete(workspaceMemberships).where(eq(workspaceMemberships.workspaceId, workspaceId));
	if (checkoutId) await db.delete(customerCheckouts).where(eq(customerCheckouts.id, checkoutId));
	if (workspaceId) await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
	if (customerId) await db.delete(customers).where(eq(customers.id, customerId));
	if (userId) await db.delete(users).where(eq(users.id, userId));
}

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { db } from '@db/client';
import {
	auditLogs,
	entitlementDefinitions,
	packageEntitlements,
	workspaceSubscriptions,
} from '@db/schema';

export interface EntitlementSnapshotItem extends Record<string, unknown> {
	code: string;
}

export interface SubscriptionEntitlementBackfillResult {
	changedSubscriptions: number;
	dryRun: boolean;
	grantedEntitlements: number;
	scannedSubscriptions: number;
}

/**
 * Explicitly approved feature-rollout entitlements that may be appended to an
 * already purchased package snapshot. Existing values are never overwritten.
 */
export const ROLLOUT_ENTITLEMENT_CODES = [
	'applications.custom_system_pages',
] as const;

/** Appends only missing entitlement codes while preserving the purchased snapshot verbatim. */
export function mergeMissingEntitlements(
	snapshot: EntitlementSnapshotItem[],
	candidates: EntitlementSnapshotItem[],
): { addedCodes: string[]; snapshot: EntitlementSnapshotItem[] } {
	const existingCodes = new Set(snapshot.map((item) => item.code));
	const additions = candidates.filter((item) => !existingCodes.has(item.code));
	return {
		addedCodes: additions.map((item) => item.code),
		snapshot: [...snapshot, ...additions],
	};
}

/**
 * Backfills allow-listed feature grants from the subscription's purchased
 * package. The operation is idempotent and writes one immutable audit event per
 * changed subscription.
 */
export async function backfillSubscriptionEntitlements(
	dryRun = true,
): Promise<SubscriptionEntitlementBackfillResult> {
	const [subscriptions, definitions] = await Promise.all([
		db
			.select({
				id: workspaceSubscriptions.id,
				packageId: workspaceSubscriptions.packageId,
				snapshot: workspaceSubscriptions.entitlementSnapshot,
			})
			.from(workspaceSubscriptions)
			.where(
				and(
					sql`${workspaceSubscriptions.status} IN ('active', 'trialing')`,
					isNull(workspaceSubscriptions.deletedAt),
				),
			),
		db
			.select({
				booleanValue: packageEntitlements.booleanValue,
				code: entitlementDefinitions.code,
				enforcementMode: entitlementDefinitions.enforcementMode,
				isCustomerVisible: entitlementDefinitions.isCustomerVisible,
				isUnlimited: packageEntitlements.isUnlimited,
				name: entitlementDefinitions.name,
				numericValue: packageEntitlements.numericValue,
				packageId: packageEntitlements.packageId,
				resetPeriod: entitlementDefinitions.resetPeriod,
				unit: entitlementDefinitions.unit,
			})
			.from(packageEntitlements)
			.innerJoin(
				entitlementDefinitions,
				eq(entitlementDefinitions.id, packageEntitlements.entitlementId),
			)
			.where(
				and(
					inArray(entitlementDefinitions.code, [...ROLLOUT_ENTITLEMENT_CODES]),
					isNull(packageEntitlements.deletedAt),
					isNull(entitlementDefinitions.deletedAt),
				),
			),
	]);

	const candidatesByPackage = new Map<string, EntitlementSnapshotItem[]>();
	for (const definition of definitions) {
		const { packageId, ...candidate } = definition;
		const candidates = candidatesByPackage.get(packageId) ?? [];
		candidates.push(candidate);
		candidatesByPackage.set(packageId, candidates);
	}

	let changedSubscriptions = 0;
	let grantedEntitlements = 0;
	for (const subscription of subscriptions) {
		const current = subscription.snapshot as EntitlementSnapshotItem[];
		const merged = mergeMissingEntitlements(
			current,
			candidatesByPackage.get(subscription.packageId) ?? [],
		);
		if (!merged.addedCodes.length) continue;
		changedSubscriptions += 1;
		grantedEntitlements += merged.addedCodes.length;
		if (dryRun) continue;
		await db.transaction(async (transaction) => {
			await transaction
				.update(workspaceSubscriptions)
				.set({ entitlementSnapshot: merged.snapshot, updatedAt: new Date() })
				.where(
					and(
						eq(workspaceSubscriptions.id, subscription.id),
						isNull(workspaceSubscriptions.deletedAt),
					),
				);
			await transaction.insert(auditLogs).values({
				action: 'subscription.entitlements_backfilled',
				metadata: {
					addedCodes: merged.addedCodes,
					newCount: merged.snapshot.length,
					previousCount: current.length,
					source: 'approved_feature_rollout',
				},
				resourceId: subscription.id,
				resourceType: 'workspace_subscription',
			});
		});
	}

	return {
		changedSubscriptions,
		dryRun,
		grantedEntitlements,
		scannedSubscriptions: subscriptions.length,
	};
}

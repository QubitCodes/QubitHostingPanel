import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';

import { db } from '@db/client';
import { entitlementDefinitions, workspaceEntitlementOverrides, workspaceSubscriptionItems, workspaceSubscriptions, workspaceUsageObservations, workspaceUsageReservations } from '@db/schema';

export type EnforcementMode = 'hard' | 'soft' | 'metered' | 'informational';
export interface QuotaDecision { allowed: boolean; code: string; current: number; limit: number | null; mode: EnforcementMode; pending: number; projected: number; warning: boolean }
export interface UsageReservationResult extends QuotaDecision { reservationId?: string; reused?: boolean }

/** Pure quota evaluation shared by runtime enforcement and concurrency tests. */
export function evaluateQuota(input: { code: string; current: number; limit: number | null; mode: EnforcementMode; pending: number; quantity: number; unlimited?: boolean }): QuotaDecision {
	const projected = input.current + input.pending + input.quantity;
	const exceeded = !input.unlimited && input.limit !== null && projected > input.limit;
	return { allowed: !exceeded || input.mode !== 'hard', code: input.code, current: input.current, limit: input.unlimited ? null : input.limit, mode: input.mode, pending: input.pending, projected, warning: exceeded };
}

function matching(snapshot: Array<Record<string, unknown>>, code: string): Record<string, unknown> | undefined { return snapshot.find((item) => item.code === code); }
function numberValue(item?: Record<string, unknown>): number { return Number(item?.numericValue ?? 0); }

/** Resolves a subscription snapshot, active add-ons, and the latest active admin override. */
export async function effectiveEntitlement(workspaceId: string, code: string): Promise<{ booleanValue?: boolean; isUnlimited: boolean; limit: number; mode: EnforcementMode; subscriptionId: string }> {
	const now = new Date();
	const [subscription] = await db.select({ id: workspaceSubscriptions.id, snapshot: workspaceSubscriptions.entitlementSnapshot }).from(workspaceSubscriptions).where(and(eq(workspaceSubscriptions.workspaceId, workspaceId), eq(workspaceSubscriptions.isPrimary, true), sql`${workspaceSubscriptions.status} IN ('active','trialing')`, isNull(workspaceSubscriptions.deletedAt))).orderBy(desc(workspaceSubscriptions.createdAt)).limit(1);
	if (!subscription) throw new Error('Active workspace subscription not found.');
	const [definition, override, items] = await Promise.all([
		db.select({ mode: entitlementDefinitions.enforcementMode }).from(entitlementDefinitions).where(and(eq(entitlementDefinitions.code, code), isNull(entitlementDefinitions.deletedAt))).limit(1),
		db.select().from(workspaceEntitlementOverrides).where(and(eq(workspaceEntitlementOverrides.workspaceId, workspaceId), eq(workspaceEntitlementOverrides.entitlementCode, code), isNull(workspaceEntitlementOverrides.revokedAt), isNull(workspaceEntitlementOverrides.deletedAt), sql`${workspaceEntitlementOverrides.expiresAt} IS NULL OR ${workspaceEntitlementOverrides.expiresAt} > ${now}`)).orderBy(desc(workspaceEntitlementOverrides.createdAt)).limit(1),
		db.select({ snapshot: workspaceSubscriptionItems.entitlementSnapshot, quantity: workspaceSubscriptionItems.quantity }).from(workspaceSubscriptionItems).where(and(eq(workspaceSubscriptionItems.subscriptionId, subscription.id), eq(workspaceSubscriptionItems.status, 'active'), isNull(workspaceSubscriptionItems.deletedAt))),
	]);
	const base = matching(subscription.snapshot, code);
	const addOnLimit = items.reduce((total, item) => total + numberValue(matching(item.snapshot, code)) * item.quantity, 0);
	const activeOverride = override[0];
	return { subscriptionId: subscription.id, isUnlimited: activeOverride?.isUnlimited ?? base?.isUnlimited === true, limit: activeOverride?.numericValue ?? numberValue(base) + addOnLimit, booleanValue: activeOverride?.booleanValue ?? (typeof base?.booleanValue === 'boolean' ? base.booleanValue : undefined), mode: (activeOverride?.enforcementMode ?? base?.enforcementMode ?? definition[0]?.mode ?? 'hard') as EnforcementMode };
}

/** Atomically reserves count capacity under a workspace+entitlement advisory lock. */
export async function reserveWorkspaceUsage(input: { code: string; current: number; idempotencyKey: string; quantity?: number; ttlMs?: number; workspaceId: string }): Promise<UsageReservationResult> {
	return db.transaction(async (transaction) => {
		await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${input.workspaceId}:${input.code}`}, 0))`);
		const [existing] = await transaction.select({ id: workspaceUsageReservations.id, status: workspaceUsageReservations.status }).from(workspaceUsageReservations).where(and(eq(workspaceUsageReservations.workspaceId, input.workspaceId), eq(workspaceUsageReservations.idempotencyKey, input.idempotencyKey), isNull(workspaceUsageReservations.deletedAt))).limit(1);
		const entitlement = await effectiveEntitlement(input.workspaceId, input.code);
		await transaction.update(workspaceUsageReservations).set({ status: 'expired', releasedAt: new Date(), releaseReason: 'Reservation TTL elapsed.', updatedAt: new Date() }).where(and(eq(workspaceUsageReservations.workspaceId, input.workspaceId), eq(workspaceUsageReservations.entitlementCode, input.code), eq(workspaceUsageReservations.status, 'pending'), sql`${workspaceUsageReservations.expiresAt} <= now()`, isNull(workspaceUsageReservations.deletedAt)));
		const [{ pending }] = await transaction.select({ pending: sql<number>`coalesce(sum(${workspaceUsageReservations.quantity}), 0)` }).from(workspaceUsageReservations).where(and(eq(workspaceUsageReservations.workspaceId, input.workspaceId), eq(workspaceUsageReservations.entitlementCode, input.code), eq(workspaceUsageReservations.status, 'pending'), gt(workspaceUsageReservations.expiresAt, new Date()), isNull(workspaceUsageReservations.deletedAt)));
		const decision = evaluateQuota({ code: input.code, current: input.current, limit: entitlement.limit, mode: entitlement.mode, pending: Number(pending), quantity: input.quantity ?? 1, unlimited: entitlement.isUnlimited });
		if (existing) return { ...decision, allowed: existing.status !== 'released' && existing.status !== 'expired', reservationId: existing.id, reused: true };
		if (!decision.allowed) return decision;
		const [reservation] = await transaction.insert(workspaceUsageReservations).values({ workspaceId: input.workspaceId, subscriptionId: entitlement.subscriptionId, entitlementCode: input.code, quantity: input.quantity ?? 1, idempotencyKey: input.idempotencyKey, expiresAt: new Date(Date.now() + (input.ttlMs ?? 300000)) }).returning({ id: workspaceUsageReservations.id });
		return { ...decision, reservationId: reservation?.id };
	});
}

/** Finalizes a reservation after the resource record is durable. */
export async function commitUsageReservation(reservationId: string, resourceType: string, resourceId: string): Promise<void> { await db.update(workspaceUsageReservations).set({ status: 'committed', committedAt: new Date(), resourceType, resourceId, updatedAt: new Date() }).where(and(eq(workspaceUsageReservations.id, reservationId), eq(workspaceUsageReservations.status, 'pending'), isNull(workspaceUsageReservations.deletedAt))); }

/** Releases capacity after validation or provisioning failure. */
export async function releaseUsageReservation(reservationId: string, reason: string): Promise<void> { await db.update(workspaceUsageReservations).set({ status: 'released', releasedAt: new Date(), releaseReason: reason, updatedAt: new Date() }).where(and(eq(workspaceUsageReservations.id, reservationId), eq(workspaceUsageReservations.status, 'pending'), isNull(workspaceUsageReservations.deletedAt))); }

/** Persists a measured usage sample with an explicit stale threshold. */
export async function recordUsageObservation(input: { code: string; metadata?: Record<string, unknown>; observedAt?: Date; periodEnd?: Date; periodStart?: Date; source: string; staleAfter: Date; unit?: string; value: number; workspaceId: string }): Promise<string> { const [row] = await db.insert(workspaceUsageObservations).values({ workspaceId: input.workspaceId, entitlementCode: input.code, value: input.value, unit: input.unit, source: input.source, observedAt: input.observedAt ?? new Date(), staleAfter: input.staleAfter, periodStart: input.periodStart, periodEnd: input.periodEnd, metadata: input.metadata ?? {} }).returning({ id: workspaceUsageObservations.id }); if (!row) throw new Error('Unable to record usage observation.'); return row.id; }

import { and, count, desc, eq, isNull, lt, max, or } from 'drizzle-orm';

import { db } from '@db/client';
import {
	customerCheckouts,
	paymentAttempts,
	providerConnections,
	providerReconciliationRuns,
	provisioningJobs,
	logicalDatabases,
	workspaceUsageObservations,
} from '@db/schema';

export interface OperationsReadinessReport {
	failedJobs: number;
	generatedAt: string;
	latestReconciliationFailures: number;
	stalePayments: number;
	staleUsage: number;
	unhealthyProviders: number;
}

/** Determines whether the report contains an operational condition requiring attention. */
export function operationsReadinessRequiresAction(
	report: OperationsReadinessReport,
): boolean {
	return Object.entries(report).some(
		([key, value]) => key !== 'generatedAt' && Number(value) > 0,
	);
}

/** Uses one pinned PostgreSQL connection so constrained poolers do not receive a burst of connections. */
export async function generateOperationsReadinessReport(
	now = new Date(),
): Promise<OperationsReadinessReport> {
	const oneHourAgo = new Date(now.getTime() - 3_600_000);
	const oneDayAgo = new Date(now.getTime() - 86_400_000);
	return db.transaction(async (transaction) => {
		const [failedJobs] = await transaction
			.select({ value: count() })
			.from(provisioningJobs)
			.where(
				and(
					eq(provisioningJobs.status, 'failed'),
					isNull(provisioningJobs.deletedAt),
				),
			);
		const [stalePayments] = await transaction
			.select({ value: count() })
			.from(paymentAttempts)
			.innerJoin(
				customerCheckouts,
				eq(customerCheckouts.id, paymentAttempts.checkoutId),
			)
			.where(
				and(
					eq(paymentAttempts.status, 'pending'),
					lt(paymentAttempts.createdAt, oneHourAgo),
					isNull(paymentAttempts.deletedAt),
					isNull(customerCheckouts.deletedAt),
				),
			);
		const [unhealthyProviders] = await transaction
			.select({ value: count() })
			.from(providerConnections)
			.where(
				and(
					or(
						eq(providerConnections.status, 'unhealthy'),
						lt(providerConnections.lastHealthyAt, oneHourAgo),
					),
					isNull(providerConnections.deletedAt),
				),
			);
		const reconciliationRuns = await transaction
			.select({
				connectionId: providerReconciliationRuns.connectionId,
				status: providerReconciliationRuns.status,
			})
			.from(providerReconciliationRuns)
			.where(isNull(providerReconciliationRuns.deletedAt))
			.orderBy(desc(providerReconciliationRuns.startedAt));
		const activeDatabaseWorkspaces = await transaction
			.selectDistinct({ workspaceId: logicalDatabases.workspaceId })
			.from(logicalDatabases)
			.where(
				and(
					eq(logicalDatabases.status, 'active'),
					isNull(logicalDatabases.deletedAt),
				),
			);
		const latestDatabaseUsage = await transaction
			.select({
				latestObservedAt: max(workspaceUsageObservations.observedAt),
				workspaceId: workspaceUsageObservations.workspaceId,
			})
			.from(workspaceUsageObservations)
			.where(
				and(
					eq(
						workspaceUsageObservations.entitlementCode,
						'databases.storage.bytes',
					),
					isNull(workspaceUsageObservations.deletedAt),
				),
			)
			.groupBy(workspaceUsageObservations.workspaceId);

		const latestByConnection = new Map<
			string,
			(typeof reconciliationRuns)[number]
		>();
		for (const run of reconciliationRuns)
			if (!latestByConnection.has(run.connectionId))
				latestByConnection.set(run.connectionId, run);
		const latestRuns = [...latestByConnection.values()];
		return {
			failedJobs: failedJobs?.value ?? 0,
			generatedAt: now.toISOString(),
			latestReconciliationFailures: latestRuns.filter(
				(run) => run.status === 'failed' || run.status === 'partial',
			).length,
			stalePayments: stalePayments?.value ?? 0,
			staleUsage: activeDatabaseWorkspaces.filter((workspace) => {
				const stream = latestDatabaseUsage.find(
					(candidate) => candidate.workspaceId === workspace.workspaceId,
				);
				return !stream?.latestObservedAt || stream.latestObservedAt < oneDayAgo;
			}).length,
			unhealthyProviders: unhealthyProviders?.value ?? 0,
		};
	});
}

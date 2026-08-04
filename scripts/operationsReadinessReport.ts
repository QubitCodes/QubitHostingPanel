import { and, count, desc, eq, isNull, lt, or } from 'drizzle-orm';
import { db } from '@db/client';
import { customerCheckouts, paymentAttempts, providerConnections, providerReconciliationRuns, provisioningJobs, workspaceUsageObservations } from '@db/schema';

const now = new Date(); const oneHourAgo = new Date(now.getTime() - 3_600_000); const oneDayAgo = new Date(now.getTime() - 86_400_000);
const [[failedJobs], [stalePayments], [unhealthyProviders], reconciliationRuns, [staleUsage]] = await Promise.all([
	db.select({ value: count() }).from(provisioningJobs).where(and(eq(provisioningJobs.status, 'failed'), isNull(provisioningJobs.deletedAt))),
	db.select({ value: count() }).from(paymentAttempts).innerJoin(customerCheckouts, eq(customerCheckouts.id, paymentAttempts.checkoutId)).where(and(eq(paymentAttempts.status, 'pending'), lt(paymentAttempts.createdAt, oneHourAgo), isNull(paymentAttempts.deletedAt), isNull(customerCheckouts.deletedAt))),
	db.select({ value: count() }).from(providerConnections).where(and(or(eq(providerConnections.status, 'unhealthy'), lt(providerConnections.lastHealthyAt, oneHourAgo)), isNull(providerConnections.deletedAt))),
	db.select({ connectionId: providerReconciliationRuns.connectionId, status: providerReconciliationRuns.status }).from(providerReconciliationRuns).where(isNull(providerReconciliationRuns.deletedAt)).orderBy(desc(providerReconciliationRuns.startedAt)),
	db.select({ value: count() }).from(workspaceUsageObservations).where(and(lt(workspaceUsageObservations.observedAt, oneDayAgo), isNull(workspaceUsageObservations.deletedAt))),
]);
const latestByConnection = new Map<string, (typeof reconciliationRuns)[number]>();
for (const run of reconciliationRuns) if (!latestByConnection.has(run.connectionId)) latestByConnection.set(run.connectionId, run);
const latestRuns = [...latestByConnection.values()];
const report = { failedJobs: failedJobs.value, generatedAt: now.toISOString(), latestReconciliationFailures: latestRuns.filter((run) => run.status === 'failed' || run.status === 'partial').length, stalePayments: stalePayments.value, staleUsage: staleUsage.value, unhealthyProviders: unhealthyProviders.value };
console.log(JSON.stringify(report));
process.exit(Object.entries(report).some(([key, value]) => key !== 'generatedAt' && Number(value) > 0) ? 2 : 0);

import { and, asc, eq, inArray, isNull, lte } from 'drizzle-orm';

import { getEnvironment } from '@config/env';
import { db } from '@db/client';
import { customerCheckouts, provisioningJobs, workspaceResources } from '@db/schema';
import { hostingProvider } from '@services/hosting/hostingProviderFactory';

/** Queues exactly one initial application provision per subscription. */
export async function queueInitialProvisioning(workspaceId: string, subscriptionId: string, checkoutId: string, workspaceName: string): Promise<string> {
	const environment = getEnvironment();
	const provider = environment.HOSTING_PROVIDER;
	const idempotencyKey = `subscription:${subscriptionId}:initial-application`;
	const [job] = await db.insert(provisioningJobs).values({ workspaceId, subscriptionId, provider, idempotencyKey, input: { checkoutId, workspaceName } }).onConflictDoNothing().returning({ id: provisioningJobs.id });
	if (job) return job.id;
	const [existing] = await db.select({ id: provisioningJobs.id }).from(provisioningJobs).where(and(eq(provisioningJobs.idempotencyKey, idempotencyKey), isNull(provisioningJobs.deletedAt))).limit(1);
	if (!existing) throw new Error('Unable to queue provisioning.');
	return existing.id;
}

/** Claims and processes bounded provisioning jobs. Safe to invoke from cron or after checkout setup. */
export async function processProvisioningJobs(limit = 5): Promise<{ failed: number; processed: number; succeeded: number }> {
	let failed = 0; let processed = 0; let succeeded = 0;
	for (let index = 0; index < limit; index += 1) {
		const now = new Date();
		const [candidate] = await db.select().from(provisioningJobs).where(and(inArray(provisioningJobs.status, ['queued', 'failed']), lte(provisioningJobs.nextAttemptAt, now), isNull(provisioningJobs.deletedAt))).orderBy(asc(provisioningJobs.createdAt)).limit(1);
		if (!candidate || candidate.attemptCount >= candidate.maximumAttempts) break;
		const [claimed] = await db.update(provisioningJobs).set({ status: 'processing', lockedAt: now, attemptCount: candidate.attemptCount + 1, updatedAt: now }).where(and(eq(provisioningJobs.id, candidate.id), inArray(provisioningJobs.status, ['queued', 'failed']))).returning();
		if (!claimed) continue;
		processed += 1;
		try {
			const input = claimed.input as { checkoutId?: string; workspaceName?: string };
			const provider = hostingProvider();
			const resourceName = `${String(input.workspaceName ?? 'workspace').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}-${claimed.workspaceId.slice(0, 8)}`;
			const [existingResource] = await db.select().from(workspaceResources).where(and(eq(workspaceResources.provisioningJobId, claimed.id), isNull(workspaceResources.deletedAt))).limit(1);
			if (existingResource) {
				const providerStatus = await provider.getDeployment(existingResource.providerResourceId);
				if (providerStatus === 'failed') throw new Error('The provider reports that deployment failed.');
				if (providerStatus !== 'succeeded') {
					await db.transaction(async (transaction) => {
						await transaction.update(workspaceResources).set({ status: 'provisioning', lastReconciledAt: new Date(), updatedAt: new Date() }).where(eq(workspaceResources.id, existingResource.id));
						await transaction.update(provisioningJobs).set({ status: 'queued', lockedAt: null, nextAttemptAt: new Date(Date.now() + 30_000), result: { providerResourceId: existingResource.providerResourceId, providerStatus }, updatedAt: new Date() }).where(eq(provisioningJobs.id, claimed.id));
					});
					continue;
				}
				await db.transaction(async (transaction) => {
					await transaction.update(workspaceResources).set({ status: 'running', lastReconciledAt: new Date(), updatedAt: new Date() }).where(eq(workspaceResources.id, existingResource.id));
					await transaction.update(provisioningJobs).set({ status: 'succeeded', completedAt: new Date(), lockedAt: null, result: { providerResourceId: existingResource.providerResourceId, providerStatus }, lastError: null, updatedAt: new Date() }).where(eq(provisioningJobs.id, claimed.id));
					if (input.checkoutId) await transaction.update(customerCheckouts).set({ status: 'active', updatedAt: new Date() }).where(eq(customerCheckouts.id, input.checkoutId));
				});
				succeeded += 1;
				continue;
			}
			const result = await provider.provisionApplication({ name: resourceName, workspaceId: claimed.workspaceId });
			await db.transaction(async (transaction) => {
				await transaction.insert(workspaceResources).values({ workspaceId: claimed.workspaceId, provisioningJobId: claimed.id, provider: claimed.provider, kind: 'application', name: resourceName, providerResourceId: result.id, status: result.status === 'succeeded' ? 'running' : 'provisioning', publicUrl: result.publicUrl, metadata: { checkoutId: input.checkoutId }, lastReconciledAt: new Date() }).onConflictDoNothing();
				await transaction.update(provisioningJobs).set({ status: result.status === 'succeeded' ? 'succeeded' : 'queued', completedAt: result.status === 'succeeded' ? new Date() : null, lockedAt: null, nextAttemptAt: new Date(Date.now() + 30_000), result: { providerResourceId: result.id, providerStatus: result.status, publicUrl: result.publicUrl }, lastError: null, updatedAt: new Date() }).where(eq(provisioningJobs.id, claimed.id));
				if (result.status === 'succeeded' && input.checkoutId) await transaction.update(customerCheckouts).set({ status: 'active', updatedAt: new Date() }).where(eq(customerCheckouts.id, input.checkoutId));
			});
			if (result.status === 'succeeded') succeeded += 1;
		} catch (error) {
			failed += 1;
			const delayMinutes = Math.min(60, 2 ** claimed.attemptCount);
			await db.update(provisioningJobs).set({ status: 'failed', lockedAt: null, lastError: error instanceof Error ? error.message.slice(0, 2000) : 'Unknown provisioning error.', nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000), updatedAt: new Date() }).where(eq(provisioningJobs.id, claimed.id));
		}
	}
	return { failed, processed, succeeded };
}

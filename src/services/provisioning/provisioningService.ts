import { and, asc, eq, inArray, isNull, lte } from 'drizzle-orm';

import { getEnvironment } from '@config/env';
import { db } from '@db/client';
import { applicationBuilds, applicationDatabaseBindings, applicationDeployments, customerCheckouts, databaseClusters, logicalDatabases, provisioningJobs, runtimeImages, workspaceResources } from '@db/schema';
import { databaseClusterEndpoint } from '@services/databases/databaseClusterEndpointService';
import { decryptCredential } from '@services/encryption/credentialEncryptionService';
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
			const input = claimed.input as { applicationBuildId?: string; checkoutId?: string; deploymentId?: string; workspaceName?: string };
			const provider = await hostingProvider();
			const [configuredApplication] = input.applicationBuildId ? await db.select({ build: applicationBuilds, runtime: runtimeImages }).from(applicationBuilds).innerJoin(runtimeImages, eq(runtimeImages.id, applicationBuilds.runtimeImageId)).where(and(eq(applicationBuilds.id, input.applicationBuildId), eq(applicationBuilds.workspaceId, claimed.workspaceId), isNull(applicationBuilds.deletedAt))).limit(1) : [];
			const applicationMetadata = configuredApplication?.build.metadata as { buildPack?: 'dockerfile' | 'nixpacks' | 'static'; name?: string } | undefined;
			const resourceName = `${String(applicationMetadata?.name ?? input.workspaceName ?? 'workspace').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}-${claimed.workspaceId.slice(0, 8)}`;
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
					if (input.applicationBuildId) await transaction.update(applicationBuilds).set({ status: 'succeeded', completedAt: new Date(), failureReason: null, updatedAt: new Date() }).where(eq(applicationBuilds.id, input.applicationBuildId));
					if (input.deploymentId) await transaction.update(applicationDeployments).set({ status: 'running', resourceId: existingResource.id, providerDeploymentId: existingResource.providerResourceId, publicUrl: existingResource.publicUrl, completedAt: new Date(), failureReason: null, updatedAt: new Date() }).where(eq(applicationDeployments.id, input.deploymentId));
					if (input.checkoutId) await transaction.update(customerCheckouts).set({ status: 'active', updatedAt: new Date() }).where(eq(customerCheckouts.id, input.checkoutId));
				});
				succeeded += 1;
				continue;
			}
			let databaseEnvironment: Array<{ key: string; value: string }> = [];
			if (configuredApplication) {
				const bindings = await db.select({ prefix: applicationDatabaseBindings.environmentPrefix, database: logicalDatabases, cluster: databaseClusters }).from(applicationDatabaseBindings).innerJoin(logicalDatabases, eq(logicalDatabases.id, applicationDatabaseBindings.logicalDatabaseId)).innerJoin(databaseClusters, eq(databaseClusters.id, logicalDatabases.clusterId)).where(and(eq(applicationDatabaseBindings.applicationBuildId, configuredApplication.build.id), isNull(applicationDatabaseBindings.deletedAt), isNull(logicalDatabases.deletedAt)));
				databaseEnvironment = bindings.flatMap(({ prefix, database, cluster }) => { const credential = JSON.parse(decryptCredential(database.credentialCiphertext)) as { databaseName: string; password: string; username: string }; const endpoint = databaseClusterEndpoint(cluster); return [{ key: `${prefix}_ENGINE`, value: cluster.engine }, { key: `${prefix}_HOST`, value: endpoint.host }, { key: `${prefix}_PORT`, value: String(endpoint.port) }, { key: `${prefix}_DATABASE`, value: credential.databaseName }, { key: `${prefix}_USERNAME`, value: credential.username }, { key: `${prefix}_PASSWORD`, value: credential.password }]; });
				const runtimeVersionVariable = configuredApplication.runtime.language === 'node' ? 'NIXPACKS_NODE_VERSION' : configuredApplication.runtime.language === 'python' ? 'NIXPACKS_PYTHON_VERSION' : configuredApplication.runtime.language === 'php' ? 'NIXPACKS_PHP_VERSION' : undefined;
				if (runtimeVersionVariable) databaseEnvironment.push({ key: runtimeVersionVariable, value: configuredApplication.runtime.version });
				await db.update(applicationBuilds).set({ status: 'building', startedAt: new Date(), updatedAt: new Date() }).where(eq(applicationBuilds.id, configuredApplication.build.id));
				if (input.deploymentId) await db.update(applicationDeployments).set({ status: 'deploying', startedAt: new Date(), updatedAt: new Date() }).where(eq(applicationDeployments.id, input.deploymentId));
			}
			const result = await provider.provisionApplication({ name: resourceName, workspaceId: claimed.workspaceId, source: configuredApplication ? { repository: configuredApplication.build.sourceRepository, branch: configuredApplication.build.sourceRef } : undefined, buildPack: applicationMetadata?.buildPack, installCommand: configuredApplication?.build.installCommand ?? undefined, buildCommand: configuredApplication?.build.buildCommand ?? undefined, startCommand: configuredApplication?.build.startCommand ?? undefined, baseDirectory: configuredApplication?.build.baseDirectory, publishDirectory: configuredApplication?.build.publishDirectory ?? undefined, domain: configuredApplication?.build.requestedDomain ?? undefined, databaseEnvironment, runtimeImage: configuredApplication ? { repository: `${configuredApplication.runtime.registry}/${configuredApplication.runtime.repository}`, tag: configuredApplication.runtime.tag, port: configuredApplication.build.applicationPort } : undefined });
			await db.transaction(async (transaction) => {
				const [resource] = await transaction.insert(workspaceResources).values({ workspaceId: claimed.workspaceId, provisioningJobId: claimed.id, provider: claimed.provider, kind: 'application', name: resourceName, providerResourceId: result.id, status: result.status === 'succeeded' ? 'running' : 'provisioning', publicUrl: result.publicUrl, metadata: { checkoutId: input.checkoutId, applicationBuildId: input.applicationBuildId }, lastReconciledAt: new Date() }).onConflictDoNothing().returning({ id: workspaceResources.id });
				if (input.applicationBuildId && resource) await transaction.update(applicationBuilds).set({ resourceId: resource.id, providerBuildId: result.id, status: result.status === 'succeeded' ? 'succeeded' : 'building', completedAt: result.status === 'succeeded' ? new Date() : null, updatedAt: new Date() }).where(eq(applicationBuilds.id, input.applicationBuildId));
				if (input.deploymentId && resource) await transaction.update(applicationDeployments).set({ resourceId: resource.id, providerDeploymentId: result.id, status: result.status === 'succeeded' ? 'running' : 'deploying', publicUrl: result.publicUrl, completedAt: result.status === 'succeeded' ? new Date() : null, updatedAt: new Date() }).where(eq(applicationDeployments.id, input.deploymentId));
				await transaction.update(provisioningJobs).set({ status: result.status === 'succeeded' ? 'succeeded' : 'queued', completedAt: result.status === 'succeeded' ? new Date() : null, lockedAt: null, nextAttemptAt: new Date(Date.now() + 30_000), result: { providerResourceId: result.id, providerStatus: result.status, publicUrl: result.publicUrl }, lastError: null, updatedAt: new Date() }).where(eq(provisioningJobs.id, claimed.id));
				if (result.status === 'succeeded' && input.checkoutId) await transaction.update(customerCheckouts).set({ status: 'active', updatedAt: new Date() }).where(eq(customerCheckouts.id, input.checkoutId));
			});
			if (result.status === 'succeeded') succeeded += 1;
		} catch (error) {
			failed += 1;
			const delayMinutes = Math.min(60, 2 ** claimed.attemptCount);
			await db.update(provisioningJobs).set({ status: 'failed', lockedAt: null, lastError: error instanceof Error ? error.message.slice(0, 2000) : 'Unknown provisioning error.', nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000), updatedAt: new Date() }).where(eq(provisioningJobs.id, claimed.id));
			const failedInput = claimed.input as { applicationBuildId?: string; deploymentId?: string };
			if (failedInput.applicationBuildId) await db.update(applicationBuilds).set({ status: 'failed', failureReason: error instanceof Error ? error.message.slice(0, 2000) : 'Unknown provisioning error.', updatedAt: new Date() }).where(eq(applicationBuilds.id, failedInput.applicationBuildId));
			if (failedInput.deploymentId) await db.update(applicationDeployments).set({ status: 'failed', failureReason: error instanceof Error ? error.message.slice(0, 2000) : 'Unknown provisioning error.', updatedAt: new Date() }).where(eq(applicationDeployments.id, failedInput.deploymentId));
		}
	}
	return { failed, processed, succeeded };
}

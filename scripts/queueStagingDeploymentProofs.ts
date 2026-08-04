import { count, eq, isNull, and } from 'drizzle-orm';

import { db } from '@db/client';
import { applicationBuilds, applicationDeployments, customers, provisioningJobs, runtimeImages, workspaceMemberships, workspaces, workspaceSubscriptions } from '@db/schema';
import { recordAuditLog } from '@services/auditLogService';
import { commitUsageReservation, releaseUsageReservation, reserveWorkspaceUsage } from '@services/usage/quotaEngine';

const STAGING_WORKSPACE_PUBLIC_ID = 100002;
const DEPLOYMENTS = [
	{
		name: 'Staging Node Hello',
		runtimeCode: 'node-22',
		repository: 'https://github.com/render-examples/express-hello-world',
		branch: 'main',
		installCommand: 'yarn install --frozen-lockfile',
		startCommand: 'node app.js',
		port: 3001
	},
	{
		name: 'Staging Laravel Hello',
		runtimeCode: 'php-8.3',
		repository: 'https://github.com/laravel/laravel',
		branch: '12.x',
		installCommand: 'composer install --no-interaction --prefer-dist --optimize-autoloader && npm install',
		buildCommand: 'npm run build',
		startCommand: 'cp .env.example .env && php artisan key:generate --force && touch database/database.sqlite && php artisan migrate --force && php artisan serve --host=0.0.0.0 --port=80',
		port: 80
	}
] as const;

/** Queues one reproducible staging application through the normal quota and provisioning tables. */
async function queueDeployment(input: typeof DEPLOYMENTS[number], workspace: { actorUserId: string; id: string; subscriptionId: string }): Promise<void> {
	const [existing] = await db.select({ id: applicationBuilds.id, status: applicationBuilds.status }).from(applicationBuilds).where(and(eq(applicationBuilds.workspaceId, workspace.id), eq(applicationBuilds.sourceRepository, input.repository), isNull(applicationBuilds.deletedAt))).limit(1);
	if (existing) {
		console.log(`${input.name}: reusing ${existing.id} (${existing.status}).`);
		return;
	}
	const [{ used }] = await db.select({ used: count() }).from(applicationBuilds).where(and(eq(applicationBuilds.workspaceId, workspace.id), isNull(applicationBuilds.deletedAt)));
	const reservation = await reserveWorkspaceUsage({ workspaceId: workspace.id, code: 'applications.count', current: Number(used), quantity: 1, idempotencyKey: `staging-proof:${input.runtimeCode}` });
	if (!reservation.allowed || !reservation.reservationId) throw new Error(`${input.name}: workspace quota rejected the deployment.`);
	try {
		const [runtime] = await db.select({ id: runtimeImages.id }).from(runtimeImages).where(and(eq(runtimeImages.code, input.runtimeCode), eq(runtimeImages.status, 'active'), isNull(runtimeImages.deletedAt))).limit(1);
		if (!runtime) throw new Error(`${input.name}: runtime ${input.runtimeCode} is unavailable.`);
		const result = await db.transaction(async (transaction) => {
		const [build] = await transaction.insert(applicationBuilds).values({ workspaceId: workspace.id, runtimeImageId: runtime.id, status: 'queued', sourceRepository: input.repository, sourceRef: input.branch, installCommand: input.installCommand, buildCommand: 'buildCommand' in input ? input.buildCommand : undefined, startCommand: input.startCommand, baseDirectory: '/', applicationPort: input.port, metadata: { name: input.name, buildPack: 'nixpacks', stagingProof: true } }).returning({ id: applicationBuilds.id });
			if (!build) throw new Error(`${input.name}: build record was not created.`);
			const [deployment] = await transaction.insert(applicationDeployments).values({ workspaceId: workspace.id, applicationBuildId: build.id }).returning({ id: applicationDeployments.id });
			const [job] = await transaction.insert(provisioningJobs).values({ workspaceId: workspace.id, subscriptionId: workspace.subscriptionId, provider: 'coolify', idempotencyKey: `application:${build.id}:deploy`, input: { applicationBuildId: build.id, deploymentId: deployment?.id } }).returning({ id: provisioningJobs.id });
			return { buildId: build.id, jobId: job?.id };
		});
		await commitUsageReservation(reservation.reservationId, 'application_build', result.buildId);
		await recordAuditLog({ actorUserId: workspace.actorUserId, action: 'application.staging_proof_queued', resourceType: 'application_build', resourceId: result.buildId, metadata: { workspacePublicId: STAGING_WORKSPACE_PUBLIC_ID, runtimeCode: input.runtimeCode, repository: input.repository } });
		console.log(`${input.name}: queued build ${result.buildId}, job ${result.jobId}.`);
	} catch (error) {
		await releaseUsageReservation(reservation.reservationId, error instanceof Error ? error.message : 'Staging deployment queue failed.');
		throw error;
	}
}

/** Resolves the pre-existing staging workspace and queues both requested proof applications. */
async function main(): Promise<void> {
	if (process.env.APP_ENV === 'production') throw new Error('Staging proof deployments cannot run from production.');
	const [workspace] = await db.select({ id: workspaces.id, subscriptionId: workspaceSubscriptions.id, actorUserId: customers.userId }).from(workspaces).innerJoin(workspaceSubscriptions, and(eq(workspaceSubscriptions.workspaceId, workspaces.id), isNull(workspaceSubscriptions.deletedAt))).innerJoin(workspaceMemberships, and(eq(workspaceMemberships.workspaceId, workspaces.id), eq(workspaceMemberships.status, 'active'), isNull(workspaceMemberships.deletedAt))).innerJoin(customers, and(eq(customers.id, workspaceMemberships.customerId), isNull(customers.deletedAt))).where(and(eq(workspaces.publicId, STAGING_WORKSPACE_PUBLIC_ID), eq(workspaces.status, 'active'), isNull(workspaces.deletedAt))).limit(1);
	if (!workspace) throw new Error(`Staging workspace ${STAGING_WORKSPACE_PUBLIC_ID} is unavailable.`);
	for (const deployment of DEPLOYMENTS) await queueDeployment(deployment, workspace);
}

await main();

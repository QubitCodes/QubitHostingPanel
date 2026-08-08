import { eq } from 'drizzle-orm';

import { db } from '@db/client';
import { auditLogs, workspaceResources } from '@db/schema';
import {
	applicationPolicySyncTargets,
	synchronizeApplicationReleaseHook,
} from '@services/applications/applicationPolicySyncService';
import { hostingProvider } from '@services/hosting/hostingProviderFactory';

const apply = process.argv.includes('--apply');
const providerFilter = process.argv.find((value) => value.startsWith('--provider-id='))?.split('=')[1];
const allTargets = await applicationPolicySyncTargets();
const targets = providerFilter
	? allTargets.filter((target) => target.providerApplicationId === providerFilter)
	: allTargets;
if (!apply) {
	console.log(JSON.stringify({
		dryRun: true,
		nextStep: 'Run npm run applications:sync:policies -- --apply after reviewing this count.',
		targetCount: targets.length,
		targets,
	}, null, 2));
	process.exit(0);
}

const provider = await hostingProvider();
let synchronized = 0;
const failures: Array<{ applicationId: string; message: string; providerApplicationId: string }> = [];
for (const target of targets) {
	try {
		const command = await synchronizeApplicationReleaseHook(provider, target);
		await db.insert(auditLogs).values({
			action: 'application.release_hook_synchronized',
			metadata: {
				commandConfigured: Boolean(command),
				framework: target.framework,
				providerApplicationId: target.providerApplicationId,
				source: 'operator_policy_sync',
			},
			resourceId: target.applicationId,
			resourceType: 'application_build',
		});
		await db.update(workspaceResources).set({ lastReconciledAt: new Date(), updatedAt: new Date() }).where(eq(workspaceResources.id, target.workspaceResourceId));
		synchronized += 1;
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown synchronization error.';
		await db.transaction(async (transaction) => {
			await transaction.update(workspaceResources).set({
				lastReconciledAt: new Date(),
				status: /404|not found/i.test(message) ? 'unknown' : undefined,
				updatedAt: new Date(),
			}).where(eq(workspaceResources.id, target.workspaceResourceId));
			await transaction.insert(auditLogs).values({
				action: 'application.release_hook_sync_failed',
				metadata: {
					framework: target.framework,
					message,
					providerApplicationId: target.providerApplicationId,
					source: 'operator_policy_sync',
				},
				resourceId: target.applicationId,
				resourceType: 'application_build',
			});
		});
		failures.push({
			applicationId: target.applicationId,
			message,
			providerApplicationId: target.providerApplicationId,
		});
	}
}

console.log(JSON.stringify({ dryRun: false, failures, synchronized, targetCount: targets.length }, null, 2));
if (failures.length) process.exitCode = 1;

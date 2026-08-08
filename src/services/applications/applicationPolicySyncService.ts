import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@db/client';
import { applicationBuilds, applicationSettings, workspaceResources } from '@db/schema';
import { applicationPostDeploymentCommand } from '@services/applications/applicationReleaseSettingsService';
import { defaultApplicationSitePolicy } from '@services/applications/applicationSitePolicyService';
import type { HostingProvider } from '@services/hosting/HostingProvider';

export interface ApplicationReleaseHookTarget {
	applicationId: string;
	framework: string | null;
	providerApplicationId: string;
}

export interface ApplicationPolicySyncTarget extends ApplicationReleaseHookTarget {
	resourceStatus: 'failed' | 'provisioning' | 'running' | 'stopped' | 'unknown';
	workspaceResourceId: string;
}

/** Returns every active provider-backed application eligible for policy synchronization. */
export async function applicationPolicySyncTargets(): Promise<ApplicationPolicySyncTarget[]> {
	return db.select({
		applicationId: applicationBuilds.id,
		framework: applicationBuilds.framework,
		providerApplicationId: workspaceResources.providerResourceId,
		resourceStatus: workspaceResources.status,
		workspaceResourceId: workspaceResources.id,
	}).from(applicationBuilds).innerJoin(
		workspaceResources,
		and(eq(workspaceResources.id, applicationBuilds.resourceId), isNull(workspaceResources.deletedAt)),
	).where(isNull(applicationBuilds.deletedAt));
}

/** Synchronizes one existing application's framework-aware provider release hook. */
export async function synchronizeApplicationReleaseHook(
	provider: HostingProvider,
	target: ApplicationReleaseHookTarget,
): Promise<string> {
	const [stored] = await db.select().from(applicationSettings).where(and(
		eq(applicationSettings.applicationBuildId, target.applicationId),
		isNull(applicationSettings.deletedAt),
	)).limit(1);
	const policy = stored ?? defaultApplicationSitePolicy(target.framework);
	const command = applicationPostDeploymentCommand(policy) ?? '';
	await provider.updateApplicationSettings(target.providerApplicationId, {
		postDeploymentCommand: command,
	});
	return command;
}

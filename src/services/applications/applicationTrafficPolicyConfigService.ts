import { createHash } from 'node:crypto';

import { and, eq, inArray, isNull } from 'drizzle-orm';

import { getEnvironment } from '@config/env';
import { db } from '@db/client';
import {
	applicationBuilds,
	applicationDomains,
	applicationSettings,
	platformSettings,
	workspaceResources,
} from '@db/schema';
import { defaultApplicationSitePolicy } from '@services/applications/applicationSitePolicyService';

export interface ManagedTrafficPolicyApplication {
	applicationId: string;
	domains: string[];
	operationalStatus: 'active' | 'suspended';
	providerApplicationId: string;
	publicErrorMode: 'detailed' | 'generic' | 'message';
	resourceStatus: 'failed' | 'provisioning' | 'running' | 'stopped' | 'unknown';
	returnErrors: boolean;
	uploadMaxRequestSizeMb: number;
}

export interface ManagedTrafficPolicyConfig {
	applications: ManagedTrafficPolicyApplication[];
	enabled: boolean;
	errorPageUrl: string;
	policyEndpoint: string;
	revision: string;
	systemPageBaseUrl: string;
}

/** Creates a deterministic revision without exposing workspace or customer identifiers. */
export function trafficPolicyRevision(
	input: Omit<ManagedTrafficPolicyConfig, 'revision'>,
): string {
	return createHash('sha256')
		.update(JSON.stringify(input))
		.digest('hex')
		.slice(0, 24);
}

/** Returns the least-privilege routing contract consumed by the host-side proxy synchronizer. */
export async function managedTrafficPolicyConfig(): Promise<ManagedTrafficPolicyConfig> {
	const environment = getEnvironment();
	const systemPageBaseUrl = environment.APP_URL.replace(/\/$/, '');
	const [platform] = await db
		.select({ enabled: platformSettings.managedTrafficPoliciesEnabled })
		.from(platformSettings)
		.where(
			and(
				eq(platformSettings.key, 'default'),
				isNull(platformSettings.deletedAt),
			),
		)
		.limit(1);

	const base = {
		applications: [] as ManagedTrafficPolicyApplication[],
		enabled: platform?.enabled === true,
		errorPageUrl: `${systemPageBaseUrl}/system/application-error`,
		policyEndpoint: `${systemPageBaseUrl}/system/traffic-policy`,
		systemPageBaseUrl,
	};
	if (!base.enabled) return { ...base, revision: trafficPolicyRevision(base) };

	const rows = await db
		.select({
			applicationId: applicationBuilds.id,
			domain: applicationDomains.hostname,
			framework: applicationBuilds.framework,
			operationalStatus: applicationBuilds.operationalStatus,
			providerApplicationId: workspaceResources.providerResourceId,
			resourceStatus: workspaceResources.status,
			settings: applicationSettings,
		})
		.from(applicationBuilds)
		.innerJoin(
			workspaceResources,
			and(
				eq(workspaceResources.id, applicationBuilds.resourceId),
				isNull(workspaceResources.deletedAt),
			),
		)
		.innerJoin(
			applicationDomains,
			and(
				eq(applicationDomains.applicationBuildId, applicationBuilds.id),
				eq(applicationDomains.status, 'verified'),
				eq(applicationDomains.isEnabled, true),
				isNull(applicationDomains.deletedAt),
			),
		)
		.leftJoin(
			applicationSettings,
			and(
				eq(applicationSettings.applicationBuildId, applicationBuilds.id),
				isNull(applicationSettings.deletedAt),
			),
		)
		.where(
			and(
				inArray(applicationBuilds.operationalStatus, ['active', 'suspended']),
				isNull(applicationBuilds.deletedAt),
			),
		);

	const grouped = new Map<string, ManagedTrafficPolicyApplication>();
	for (const row of rows) {
		const policy = row.settings ?? defaultApplicationSitePolicy(row.framework);
		const existing = grouped.get(row.applicationId);
		if (existing) {
			if (!existing.domains.includes(row.domain)) existing.domains.push(row.domain);
			continue;
		}
		grouped.set(row.applicationId, {
			applicationId: row.applicationId,
			domains: [row.domain],
			operationalStatus: row.operationalStatus as 'active' | 'suspended',
			providerApplicationId: row.providerApplicationId,
			publicErrorMode: policy.publicErrorMode,
			resourceStatus: row.resourceStatus,
			returnErrors: policy.returnErrors,
			uploadMaxRequestSizeMb: policy.uploadMaxRequestSizeMb,
		});
	}

	base.applications = [...grouped.values()]
		.map((application) => ({
			...application,
			domains: [...application.domains].sort(),
		}))
		.sort((left, right) => left.applicationId.localeCompare(right.applicationId));
	return { ...base, revision: trafficPolicyRevision(base) };
}

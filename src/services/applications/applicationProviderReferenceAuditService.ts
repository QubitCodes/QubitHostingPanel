import type {
	HostingProvider,
	ProviderResource,
} from '@services/hosting/HostingProvider';
import {
	applicationPolicySyncTargets,
	type ApplicationPolicySyncTarget,
} from '@services/applications/applicationPolicySyncService';

export type ProviderReferenceClassification =
	| 'confirmed_missing'
	| 'present'
	| 'provider_unavailable';

export interface ProviderReferenceAuditRecord {
	applicationId: string;
	classification: ProviderReferenceClassification;
	providerApplicationId: string;
	providerStatus: string | null;
	resourceStatus: ApplicationPolicySyncTarget['resourceStatus'];
	workspaceResourceId: string;
}

export interface ProviderReferenceAuditReport {
	confirmedMissing: number;
	present: number;
	providerAvailable: boolean;
	providerUnavailable: number;
	records: ProviderReferenceAuditRecord[];
	total: number;
}

/** Classifies one successful provider inventory snapshot against local references. */
export function classifyApplicationProviderReferences(
	targets: ApplicationPolicySyncTarget[],
	resources: readonly ProviderResource[],
): ProviderReferenceAuditReport {
	const applications = new Map(
		resources
			.filter((resource) => resource.kind === 'application')
			.map((resource) => [resource.id, resource] as const),
	);
	const records = targets.map((target) => {
		const resource = applications.get(target.providerApplicationId);
		return {
			applicationId: target.applicationId,
			classification: resource ? ('present' as const) : ('confirmed_missing' as const),
			providerApplicationId: target.providerApplicationId,
			providerStatus: resource?.status ?? null,
			resourceStatus: target.resourceStatus,
			workspaceResourceId: target.workspaceResourceId,
		};
	});
	return {
		confirmedMissing: records.filter(
			(record) => record.classification === 'confirmed_missing',
		).length,
		present: records.filter((record) => record.classification === 'present').length,
		providerAvailable: true,
		providerUnavailable: 0,
		records,
		total: records.length,
	};
}

/** Compares local application references with one provider inventory snapshot without mutating customer data. */
export async function auditApplicationProviderReferences(
	provider: HostingProvider,
): Promise<ProviderReferenceAuditReport> {
	const targets = await applicationPolicySyncTargets();
	let resources: readonly ProviderResource[];
	try {
		resources = await provider.listResources();
	} catch {
		const records = targets.map((target) => ({
			applicationId: target.applicationId,
			classification: 'provider_unavailable' as const,
			providerApplicationId: target.providerApplicationId,
			providerStatus: null,
			resourceStatus: target.resourceStatus,
			workspaceResourceId: target.workspaceResourceId,
		}));
		return {
			confirmedMissing: 0,
			present: 0,
			providerAvailable: false,
			providerUnavailable: records.length,
			records,
			total: records.length,
		};
	}

	return classifyApplicationProviderReferences(targets, resources);
}

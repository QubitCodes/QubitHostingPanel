import { defaultApplicationReleasePolicy } from '@services/applications/applicationReleaseSettingsService';

export interface ApplicationSitePolicy {
	comingSoonEnabled: boolean;
	comingSoonExpiresAt: Date | null;
	maintenanceDuringDeployment: boolean;
	maintenanceEnabled: boolean;
	maintenanceExpiresAt: Date | null;
	migrateOnDeploy: boolean;
	migrationCommand: string | null;
	migrationTimeoutSeconds: number;
	publicErrorMode: 'detailed' | 'generic' | 'message';
	returnErrors: boolean;
	runSeederOnDeploy: boolean;
	seederCommand: string | null;
	seederTimeoutSeconds: number;
	uploadAllowedExtensions: string[];
	uploadAllowedMimeTypes: string[];
	uploadMaxFileSizeMb: number;
	uploadMaxRequestSizeMb: number;
	uploadTimeoutSeconds: number;
}

/** Returns the complete application policy used before a stored row exists. */
export function defaultApplicationSitePolicy(
	framework?: string | null,
): ApplicationSitePolicy {
	return {
		...defaultApplicationReleasePolicy(framework),
		comingSoonEnabled: false,
		comingSoonExpiresAt: null,
		maintenanceDuringDeployment: false,
		maintenanceEnabled: false,
		maintenanceExpiresAt: null,
		publicErrorMode: 'message',
		returnErrors: true,
		uploadAllowedExtensions: [],
		uploadAllowedMimeTypes: [],
		uploadMaxFileSizeMb: 50,
		uploadMaxRequestSizeMb: 100,
		uploadTimeoutSeconds: 300,
	};
}

/** Resolves expiry-aware site states without mutating persisted toggles. */
export function effectiveApplicationSiteState(
	settings: Pick<
		ApplicationSitePolicy,
		| 'comingSoonEnabled'
		| 'comingSoonExpiresAt'
		| 'maintenanceEnabled'
		| 'maintenanceExpiresAt'
	>,
	now = new Date(),
): { comingSoonActive: boolean; maintenanceActive: boolean } {
	return {
		comingSoonActive:
			settings.comingSoonEnabled &&
			(!settings.comingSoonExpiresAt || settings.comingSoonExpiresAt > now),
		maintenanceActive:
			settings.maintenanceEnabled &&
			(!settings.maintenanceExpiresAt || settings.maintenanceExpiresAt > now),
	};
}

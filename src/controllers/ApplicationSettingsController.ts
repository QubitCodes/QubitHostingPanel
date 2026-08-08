import { and, eq, isNull } from 'drizzle-orm';
import { resp } from '@qubitcodes/qcresp';

import { applicationWorkspaceAccess } from '@controllers/ApplicationController';
import { db } from '@db/client';
import { applicationBuilds, applicationSettings, workspaceResources } from '@db/schema';
import type { UpdateApplicationSettingsRequest } from '@schemas/applicationSettings';
import { recordAuditLog } from '@services/auditLogService';
import { applicationPostDeploymentCommand } from '@services/applications/applicationReleaseSettingsService';
import { defaultApplicationSitePolicy, effectiveApplicationSiteState, type ApplicationSitePolicy } from '@services/applications/applicationSitePolicyService';
import { hostingProvider } from '@services/hosting/hostingProviderFactory';
import { effectiveEntitlement } from '@services/usage/quotaEngine';
import type { RequestMetadata } from '@utils/request';

async function ownedApplication(request: Request, workspacePublicId: number, applicationId: string, metadata: RequestMetadata) {
	const workspace = await applicationWorkspaceAccess(request, workspacePublicId, metadata);
	const [application] = await db.select({
		framework: applicationBuilds.framework,
		id: applicationBuilds.id,
		providerId: workspaceResources.providerResourceId,
	}).from(applicationBuilds)
		.leftJoin(workspaceResources, and(eq(workspaceResources.id, applicationBuilds.resourceId), isNull(workspaceResources.deletedAt)))
		.where(and(eq(applicationBuilds.id, applicationId), eq(applicationBuilds.workspaceId, workspace.id), isNull(applicationBuilds.deletedAt)))
		.limit(1);
	if (!application) throw new Error('Application not found.');
	return { ...application, actorUserId: workspace.actorUserId, workspaceId: workspace.id };
}

function editableSettings(settings: ApplicationSitePolicy) {
	return {
		comingSoonEnabled: settings.comingSoonEnabled,
		comingSoonExpiresAt: settings.comingSoonExpiresAt,
		maintenanceDuringDeployment: settings.maintenanceDuringDeployment,
		maintenanceEnabled: settings.maintenanceEnabled,
		maintenanceExpiresAt: settings.maintenanceExpiresAt,
		migrateOnDeploy: settings.migrateOnDeploy,
		migrationCommand: settings.migrationCommand,
		migrationTimeoutSeconds: settings.migrationTimeoutSeconds,
		publicErrorMode: settings.publicErrorMode,
		returnErrors: settings.returnErrors,
		runSeederOnDeploy: settings.runSeederOnDeploy,
		seederCommand: settings.seederCommand,
		seederTimeoutSeconds: settings.seederTimeoutSeconds,
		uploadAllowedExtensions: settings.uploadAllowedExtensions,
		uploadAllowedMimeTypes: settings.uploadAllowedMimeTypes,
		uploadMaxFileSizeMb: settings.uploadMaxFileSizeMb,
		uploadMaxRequestSizeMb: settings.uploadMaxRequestSizeMb,
		uploadTimeoutSeconds: settings.uploadTimeoutSeconds,
	};
}

/** Workspace application settings with framework defaults and commercial locks. */
export class ApplicationSettingsController {
	public static async show(request: Request, workspacePublicId: number, applicationId: string, metadata: RequestMetadata): Promise<Response> {
		try {
			const application = await ownedApplication(request, workspacePublicId, applicationId, metadata);
			const [stored] = await db.select().from(applicationSettings).where(and(eq(applicationSettings.applicationBuildId, application.id), isNull(applicationSettings.deletedAt))).limit(1);
			const settings = stored ?? defaultApplicationSitePolicy(application.framework);
			const customPages = await effectiveEntitlement(application.workspaceId, 'applications.custom_system_pages');
			await recordAuditLog({ action: 'application.settings_viewed', actorUserId: application.actorUserId, ipAddress: metadata.ipAddress, resourceId: application.id, resourceType: 'application', userAgent: metadata.userAgent });
			return resp.success('Application settings retrieved.', {
				customPagesAllowed: customPages.booleanValue === true,
				effectiveSiteState: effectiveApplicationSiteState(settings),
				framework: application.framework,
				settings: editableSettings(settings),
			});
		} catch (error) {
			return resp.failure(error instanceof Error ? error.message : 'Application settings are unavailable.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
		}
	}

	public static async update(request: Request, workspacePublicId: number, applicationId: string, input: UpdateApplicationSettingsRequest, metadata: RequestMetadata): Promise<Response> {
		try {
			const application = await ownedApplication(request, workspacePublicId, applicationId, metadata);
			const values = {
				...input,
				comingSoonExpiresAt: input.comingSoonExpiresAt ? new Date(input.comingSoonExpiresAt) : null,
				maintenanceExpiresAt: input.maintenanceExpiresAt ? new Date(input.maintenanceExpiresAt) : null,
				uploadAllowedExtensions: [...new Set(input.uploadAllowedExtensions.map((value) => value.replace(/^\./, '')))],
				uploadAllowedMimeTypes: [...new Set(input.uploadAllowedMimeTypes)],
				updatedAt: new Date(),
			};
			const [existing] = await db.select({ id: applicationSettings.id }).from(applicationSettings).where(and(eq(applicationSettings.applicationBuildId, application.id), isNull(applicationSettings.deletedAt))).limit(1);
			const [settings] = existing
				? await db.update(applicationSettings).set(values).where(eq(applicationSettings.id, existing.id)).returning()
				: await db.insert(applicationSettings).values({ ...values, applicationBuildId: application.id }).returning();
			if (!settings) throw new Error('Application settings could not be saved.');
			if (application.providerId)
				await (await hostingProvider()).updateApplicationSettings(application.providerId, {
					postDeploymentCommand: applicationPostDeploymentCommand(settings) ?? '',
				});
			await recordAuditLog({
				action: 'application.settings_updated',
				actorUserId: application.actorUserId,
				ipAddress: metadata.ipAddress,
				metadata: { changedFields: Object.keys(input), migrateOnDeploy: settings.migrateOnDeploy, runSeederOnDeploy: settings.runSeederOnDeploy },
				resourceId: application.id,
				resourceType: 'application',
				userAgent: metadata.userAgent,
			});
			return resp.success('Application settings saved.', { effectiveSiteState: effectiveApplicationSiteState(settings), settings: editableSettings(settings) }, resp.codes.UPDATED);
		} catch (error) {
			return resp.failure(error instanceof Error ? error.message : 'Application settings could not be saved.', resp.codes.GENERAL_BUSINESS_LOGIC_ERROR, undefined, null, undefined, 422);
		}
	}
}

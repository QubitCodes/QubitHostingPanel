import { and, eq, isNull } from 'drizzle-orm';
import { resp } from '@qubitcodes/qcresp';
import { db } from '@db/client';
import { applicationBuilds, customers, users, workspaceMemberships, workspaceResources, workspaces } from '@db/schema';
import { recordRequiredAdminAuditLog } from '@services/auditLogService';
import { authorizeAdmin } from '@services/authorization/adminAuthorizationService';
import { hostingProvider } from '@services/hosting/hostingProviderFactory';
import type { RequestMetadata } from '@utils/request';

type Action = 'redeploy' | 'restart' | 'start' | 'stop';
export class AdminApplicationControlController {
	public static async control(request: Request, userPublicId: number, workspacePublicId: number, applicationId: string, input: { action: Action; reason: string }, metadata: RequestMetadata): Promise<Response> {
		const permission = input.action === 'redeploy' ? 'deployments.retry' : `applications.${input.action}`;
		try {
			const actor = await authorizeAdmin(request, permission, metadata);
			const [application] = await db.select({ buildId: applicationBuilds.id, resourceId: workspaceResources.id, providerId: workspaceResources.providerResourceId }).from(applicationBuilds).innerJoin(workspaces, and(eq(workspaces.id, applicationBuilds.workspaceId), eq(workspaces.publicId, workspacePublicId), isNull(workspaces.deletedAt))).innerJoin(workspaceMemberships, and(eq(workspaceMemberships.workspaceId, workspaces.id), isNull(workspaceMemberships.deletedAt))).innerJoin(customers, and(eq(customers.id, workspaceMemberships.customerId), isNull(customers.deletedAt))).innerJoin(users, and(eq(users.id, customers.userId), eq(users.publicId, userPublicId), isNull(users.deletedAt))).innerJoin(workspaceResources, and(eq(workspaceResources.id, applicationBuilds.resourceId), isNull(workspaceResources.deletedAt))).where(and(eq(applicationBuilds.id, applicationId), isNull(applicationBuilds.deletedAt))).limit(1);
			if (!application) return resp.failure('Application not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
			const result = await (await hostingProvider()).controlApplication(application.providerId, input.action);
			await db.update(workspaceResources).set({ status: input.action === 'stop' ? 'stopped' : 'provisioning', providerDeploymentId: result.deploymentId ?? undefined, updatedAt: new Date() }).where(eq(workspaceResources.id, application.resourceId));
			await recordRequiredAdminAuditLog({ actorUserId: actor.userId, action: `admin.${permission}`, resourceType: 'application_build', resourceId: application.buildId, reason: input.reason, metadata: { permission, userPublicId, workspacePublicId, providerAction: input.action, providerDeploymentId: result.deploymentId }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent });
			return resp.success(`Application ${input.action} requested.`, result, resp.codes.ACCEPTED, undefined, 202);
		} catch (error) { return resp.failure(error instanceof Error ? error.message : 'Permission denied.', resp.codes.EXTERNAL_SERVICE_ERROR, undefined, null, undefined, 502); }
	}
}

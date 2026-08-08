import { resp } from '@qubitcodes/qcresp';

import type { CreatePlatformDeploymentInput } from '@schemas/platformDeployment';
import { recordRequiredAdminAuditLog } from '@services/auditLogService';
import {
	getPlatformDeployment,
	listPlatformDeployments,
	startPlatformDeployment,
	toPlatformDeploymentView,
} from '@services/operations/platformDeploymentService';
import { authorizeAdmin } from '@services/authorization/adminAuthorizationService';
import type { RequestMetadata } from '@utils/request';

async function authorizeSuperAdmin(
	request: Request,
	metadata: RequestMetadata,
) {
	const actor = await authorizeAdmin(request, 'deployments.view', metadata);
	if (!actor.isSuperAdmin) throw new Error('Super Admin access required.');
	return actor;
}

/** Super Admin-only control-plane deployment endpoints. */
export class PlatformDeploymentController {
	public static async index(
		request: Request,
		metadata: RequestMetadata,
	): Promise<Response> {
		let actor: Awaited<ReturnType<typeof authorizeSuperAdmin>>;
		try {
			actor = await authorizeSuperAdmin(request, metadata);
		} catch {
			return resp.failure(
				'Super Admin access required.',
				resp.codes.PERMISSION_DENIED,
				undefined,
				null,
				undefined,
				403,
			);
		}
		try {
			const deployments = await listPlatformDeployments();
			await recordRequiredAdminAuditLog({
				action: 'admin.platform_deployments.view',
				actorUserId: actor.userId,
				ipAddress: metadata.ipAddress,
				metadata: { resultCount: deployments.length },
				resourceType: 'platform_deployment',
				userAgent: metadata.userAgent,
			});
			return resp.success('Platform deployments retrieved.', {
				configured: Boolean(process.env.COOLIFY_PLATFORM_APPLICATION_UUID?.trim()),
				deployments: deployments.map(toPlatformDeploymentView),
			});
		} catch (error) {
			return resp.failure(
				error instanceof Error
					? error.message
					: 'Unable to retrieve platform deployments.',
				resp.codes.GENERAL_SERVER_ERROR,
				undefined,
				null,
				undefined,
				500,
			);
		}
	}

	public static async create(
		request: Request,
		_input: CreatePlatformDeploymentInput,
		metadata: RequestMetadata,
	): Promise<Response> {
		let actor: Awaited<ReturnType<typeof authorizeSuperAdmin>>;
		try {
			actor = await authorizeSuperAdmin(request, metadata);
		} catch {
			return resp.failure(
				'Super Admin access required.',
				resp.codes.PERMISSION_DENIED,
				undefined,
				null,
				undefined,
				403,
			);
		}
		try {
			const deployment = await startPlatformDeployment(actor.userId);
			await recordRequiredAdminAuditLog({
				action: 'admin.platform_deployment.requested',
				actorUserId: actor.userId,
				ipAddress: metadata.ipAddress,
				metadata: { confirmation: 'DEPLOY' },
				reason: 'Super Admin confirmed deployment of the latest pushed revision.',
				resourceId: deployment.id,
				resourceType: 'platform_deployment',
				userAgent: metadata.userAgent,
			});
			return resp.success(
				'Platform deployment started.',
				toPlatformDeploymentView(deployment),
				resp.codes.ACCEPTED,
				undefined,
				202,
			);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Unable to start deployment.';
			const failedDeployment =
				error && typeof error === 'object' && 'deployment' in error
					? (error as { deployment?: { id?: string } }).deployment
					: undefined;
			await recordRequiredAdminAuditLog({
				action: 'admin.platform_deployment.request_failed',
				actorUserId: actor.userId,
				ipAddress: metadata.ipAddress,
				metadata: { message },
				reason: 'Platform deployment request failed.',
				resourceId: failedDeployment?.id,
				resourceType: 'platform_deployment',
				userAgent: metadata.userAgent,
			});
			return resp.failure(
				message,
				message.includes('already active')
					? resp.codes.ORDER_CANNOT_BE_PROCESSED
					: resp.codes.EXTERNAL_SERVICE_ERROR,
				undefined,
				null,
				undefined,
				message.includes('already active') ? 409 : 502,
			);
		}
	}

	public static async show(
		request: Request,
		deploymentId: string,
		metadata: RequestMetadata,
	): Promise<Response> {
		try {
			await authorizeSuperAdmin(request, metadata);
		} catch {
			return resp.failure(
				'Super Admin access required.',
				resp.codes.PERMISSION_DENIED,
				undefined,
				null,
				undefined,
				403,
			);
		}
		try {
			const deployment = await getPlatformDeployment(deploymentId);
			return deployment
				? resp.success(
						'Platform deployment refreshed.',
						toPlatformDeploymentView(deployment),
					)
				: resp.failure(
						'Platform deployment not found.',
						resp.codes.RESOURCE_NOT_FOUND,
						undefined,
						null,
						undefined,
						404,
					);
		} catch (error) {
			return resp.failure(
				error instanceof Error ? error.message : 'Deployment refresh failed.',
				resp.codes.EXTERNAL_SERVICE_ERROR,
				undefined,
				null,
				undefined,
				502,
			);
		}
	}
}

import { timingSafeEqual } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { resp } from '@qubitcodes/qcresp';

import { getEnvironment } from '@config/env';
import { db } from '@db/client';
import {
	applicationBuilds,
	applicationDeployments,
	workspaceResources,
} from '@db/schema';
import type { CoolifyWebhookRequest } from '@schemas/coolifyWebhook';
import { publishApplicationEvent } from '@services/applications/applicationRealtimeService';

/** Performs a length-safe comparison without leaking the configured webhook secret. */
function validSecret(actual: string, expected: string): boolean {
	const left = Buffer.from(actual);
	const right = Buffer.from(expected);
	return left.length === right.length && timingSafeEqual(left, right);
}

/** Accepts authenticated Coolify notification events and reconciles local terminal state. */
export class CoolifyWebhookController {
	public static async receive(
		url: URL,
		input: CoolifyWebhookRequest,
	): Promise<Response> {
		const expected = getEnvironment().COOLIFY_WEBHOOK_SECRET;
		const actual = url.searchParams.get('secret') ?? '';
		if (!expected || !validSecret(actual, expected))
			return resp.failure(
				'Resource not found.',
				resp.codes.RESOURCE_NOT_FOUND,
				undefined,
				null,
				undefined,
				404,
			);
		if (input.event === 'test')
			return resp.success('Coolify webhook verified.');
		if (!input.application_uuid)
			return resp.failure(
				'Invalid webhook payload.',
				resp.codes.VALIDATION_ERROR,
				undefined,
				null,
				undefined,
				400,
			);
		const [application] = await db
			.select({
				buildId: applicationBuilds.id,
				resourceId: workspaceResources.id,
			})
			.from(workspaceResources)
			.innerJoin(
				applicationBuilds,
				and(
					eq(applicationBuilds.resourceId, workspaceResources.id),
					isNull(applicationBuilds.deletedAt),
				),
			)
			.where(
				and(
					eq(workspaceResources.providerResourceId, input.application_uuid),
					isNull(workspaceResources.deletedAt),
				),
			)
			.limit(1);
		if (!application) return resp.success('Event acknowledged.');
		const failed = input.event === 'deployment_failed' || !input.success;
		const buildStatus = failed
			? 'failed'
			: input.event === 'deployment_success'
				? 'succeeded'
				: undefined;
		const resourceStatus = failed
			? 'failed'
			: input.event === 'deployment_success'
				? 'running'
				: 'stopped';
		await db.transaction(async (transaction) => {
			await transaction
				.update(workspaceResources)
				.set({
					status: resourceStatus,
					lastReconciledAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(workspaceResources.id, application.resourceId));
			if (buildStatus)
				await transaction
					.update(applicationBuilds)
					.set({
						status: buildStatus,
						failureReason: failed ? input.message : null,
						updatedAt: new Date(),
					})
					.where(eq(applicationBuilds.id, application.buildId));
			if (input.deployment_uuid)
				await transaction
					.update(applicationDeployments)
					.set({
						status: failed ? 'failed' : 'running',
						failureReason: failed ? input.message : null,
						completedAt: new Date(),
						updatedAt: new Date(),
					})
					.where(
						and(
							eq(
								applicationDeployments.applicationBuildId,
								application.buildId,
							),
							eq(
								applicationDeployments.providerDeploymentId,
								input.deployment_uuid,
							),
							isNull(applicationDeployments.deletedAt),
						),
					);
		});
		publishApplicationEvent({
			applicationId: application.buildId,
			deploymentId: input.deployment_uuid,
			deploymentStatus: failed ? 'failed' : 'finished',
			providerStatus: resourceStatus,
			type: 'deployment',
		});
		return resp.success('Event processed.');
	}
}

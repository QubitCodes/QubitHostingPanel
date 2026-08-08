import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

import { getEnvironment } from '@config/env';
import { db } from '@db/client';
import { platformDeployments, type PlatformDeployment } from '@db/schema';
import { sanitizeCustomerDeploymentLog } from '@services/applications/deploymentLogSanitizerService';
import { recordRequiredAdminAuditLog } from '@services/auditLogService';
import { managedCoolifyProvider } from '@services/hosting/providerConnectionService';

const ACTIVE_STATUSES = ['queued', 'running'] as const;
const MAX_LOG_CHARACTERS = 1_000_000;

export interface PlatformDeploymentView {
	commitMessage: string | null;
	commitSha: string | null;
	completedAt: Date | null;
	createdAt: Date;
	failureMessage: string | null;
	id: string;
	lastPollError: string | null;
	logs: string;
	providerStatus: string | null;
	startedAt: Date | null;
	status: PlatformDeployment['status'];
	updatedAt: Date;
}

/** Removes internal target and provider identifiers before a deployment reaches the browser. */
export function toPlatformDeploymentView(
	deployment: PlatformDeployment,
): PlatformDeploymentView {
	return {
		commitMessage: deployment.commitMessage,
		commitSha: deployment.commitSha,
		completedAt: deployment.completedAt,
		createdAt: deployment.createdAt,
		failureMessage: deployment.failureMessage,
		id: deployment.id,
		lastPollError: deployment.lastPollError,
		logs: deployment.logs,
		providerStatus: deployment.providerStatus,
		startedAt: deployment.startedAt,
		status: deployment.status,
		updatedAt: deployment.updatedAt,
	};
}

/** Maps provider-specific deployment states to the stable platform lifecycle. */
export function normalizePlatformDeploymentStatus(
	status: string,
): PlatformDeployment['status'] {
	const normalized = status.toLowerCase();
	if (/failed|error/.test(normalized)) return 'failed';
	if (/cancelled|canceled/.test(normalized)) return 'cancelled';
	if (/finished|succeeded|success|completed/.test(normalized)) return 'succeeded';
	if (/queued|pending/.test(normalized)) return 'queued';
	return 'running';
}

function targetApplicationUuid(): string {
	const value = getEnvironment().COOLIFY_PLATFORM_APPLICATION_UUID?.trim();
	if (!value)
		throw new Error('Platform deployment target is not configured.');
	return value;
}

function boundedLogs(value: string | null | undefined): string {
	const sanitized = sanitizeCustomerDeploymentLog(value ?? '');
	return sanitized.slice(-MAX_LOG_CHARACTERS);
}

/** Starts one deployment of the fixed control-plane target and persists it before the provider call. */
export async function startPlatformDeployment(
	requestedByUserId: string,
): Promise<PlatformDeployment> {
	const target = targetApplicationUuid();
	const [active] = await db
		.select({ id: platformDeployments.id })
		.from(platformDeployments)
		.where(
			and(
				eq(platformDeployments.targetApplicationUuid, target),
				inArray(platformDeployments.status, [...ACTIVE_STATUSES]),
				isNull(platformDeployments.deletedAt),
			),
		)
		.limit(1);
	if (active) throw new Error('A platform deployment is already active.');

	let deployment: PlatformDeployment;
	try {
		[deployment] = await db
			.insert(platformDeployments)
			.values({
				requestedByUserId,
				status: 'queued',
				targetApplicationUuid: target,
			})
			.returning();
	} catch (error) {
		if (
			error &&
			typeof error === 'object' &&
			'code' in error &&
			(error as { code?: string }).code === '23505'
		)
			throw new Error('A platform deployment is already active.');
		throw error;
	}

	try {
		const provider = await managedCoolifyProvider();
		const result = await provider.controlApplication(target, 'redeploy');
		const [updated] = await db
			.update(platformDeployments)
			.set({
				providerDeploymentId: result.deploymentId ?? null,
				providerStatus: 'requested',
				startedAt: new Date(),
				status: 'running',
				updatedAt: new Date(),
			})
			.where(eq(platformDeployments.id, deployment.id))
			.returning();
		return updated;
	} catch (error) {
		const message = boundedLogs(
			error instanceof Error ? error.message : 'Deployment request failed.',
		).slice(0, 500);
		const [failed] = await db
			.update(platformDeployments)
			.set({
				completedAt: new Date(),
				failureMessage: message,
				providerStatus: 'request_failed',
				status: 'failed',
				updatedAt: new Date(),
			})
			.where(eq(platformDeployments.id, deployment.id))
			.returning();
		throw Object.assign(new Error(message), { deployment: failed });
	}
}

/** Refreshes a persisted deployment from Coolify while tolerating the panel's own restart window. */
export async function refreshPlatformDeployment(
	deployment: PlatformDeployment,
): Promise<PlatformDeployment> {
	if (!ACTIVE_STATUSES.includes(deployment.status as (typeof ACTIVE_STATUSES)[number]))
		return deployment;
	try {
		const provider = await managedCoolifyProvider();
		const providerDeployment = deployment.providerDeploymentId
			? await provider.getApplicationDeployment(deployment.providerDeploymentId)
			: (await provider.listApplicationDeployments(
					deployment.targetApplicationUuid,
					1,
				))[0];
		if (!providerDeployment) return deployment;
		if (
			!deployment.providerDeploymentId &&
			providerDeployment.createdAt &&
			new Date(providerDeployment.createdAt).getTime() <
				deployment.createdAt.getTime() - 30_000
		)
			return deployment;
		const status = normalizePlatformDeploymentStatus(providerDeployment.status);
		const completed = ['succeeded', 'failed', 'cancelled'].includes(status);
		const logs = boundedLogs(providerDeployment.logs);
		const [updated] = await db
			.update(platformDeployments)
			.set({
				commitMessage: providerDeployment.commitMessage ?? null,
				commitSha: providerDeployment.commitSha ?? null,
				completedAt: completed
					? providerDeployment.finishedAt
						? new Date(providerDeployment.finishedAt)
						: new Date()
					: null,
				failureMessage:
					status === 'failed'
						? providerDeployment.diagnostic?.title ?? 'Deployment failed.'
						: null,
				lastPollError: null,
				logs,
				providerDeploymentId: providerDeployment.id,
				providerStatus: providerDeployment.status,
				startedAt:
					deployment.startedAt ??
					(providerDeployment.createdAt
						? new Date(providerDeployment.createdAt)
						: new Date()),
				status,
				updatedAt: new Date(),
			})
			.where(eq(platformDeployments.id, deployment.id))
			.returning();
		if (completed)
			await recordRequiredAdminAuditLog({
				action: `admin.platform_deployment.${status}`,
				actorUserId: deployment.requestedByUserId,
				metadata: {
					commitSha: providerDeployment.commitSha ?? null,
					providerStatus: providerDeployment.status,
				},
				resourceId: deployment.id,
				resourceType: 'platform_deployment',
			});
		return updated;
	} catch (error) {
		void error;
		const message = 'Hosting provider status is temporarily unavailable.';
		const [updated] = await db
			.update(platformDeployments)
			.set({ lastPollError: message, updatedAt: new Date() })
			.where(eq(platformDeployments.id, deployment.id))
			.returning();
		return updated;
	}
}

/** Returns recent platform deployments and refreshes the newest active row. */
export async function listPlatformDeployments(): Promise<PlatformDeployment[]> {
	const rows = await db
		.select()
		.from(platformDeployments)
		.where(isNull(platformDeployments.deletedAt))
		.orderBy(desc(platformDeployments.createdAt))
		.limit(25);
	if (!rows[0] || !ACTIVE_STATUSES.includes(rows[0].status as (typeof ACTIVE_STATUSES)[number]))
		return rows;
	const refreshed = await refreshPlatformDeployment(rows[0]);
	return [refreshed, ...rows.slice(1)];
}

/** Returns one deployment, refreshing it while it is active. */
export async function getPlatformDeployment(
	id: string,
): Promise<PlatformDeployment | undefined> {
	const [row] = await db
		.select()
		.from(platformDeployments)
		.where(
			and(
				eq(platformDeployments.id, id),
				isNull(platformDeployments.deletedAt),
			),
		)
		.limit(1);
	return row ? refreshPlatformDeployment(row) : undefined;
}

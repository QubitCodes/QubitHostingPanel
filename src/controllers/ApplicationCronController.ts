import { and, asc, count, eq, isNull } from 'drizzle-orm';
import { resp } from '@qubitcodes/qcresp';

import { db } from '@db/client';
import { applicationBuilds, applicationCronJobs, customers, runtimeImages, workspaceMemberships, workspaceResources, workspaces } from '@db/schema';
import type { CreateApplicationCronRequest } from '@schemas/applicationCron';
import { recordAuditLog } from '@services/auditLogService';
import { cronMinimumIntervalMinutes, resolveApplicationCronCommand } from '@services/applications/applicationCronService';
import { authenticateSession } from '@services/auth/authenticatedSessionService';
import { hostingProvider } from '@services/hosting/hostingProviderFactory';
import { effectiveEntitlement } from '@services/usage/quotaEngine';
import type { RequestMetadata } from '@utils/request';

async function ownedApplication(request: Request, workspacePublicId: number, applicationId: string, metadata: RequestMetadata) {
	const actor = await authenticateSession(request, metadata);
	const [application] = await db.select({ id: applicationBuilds.id, framework: applicationBuilds.framework, language: runtimeImages.language, providerId: workspaceResources.providerResourceId, workspaceId: workspaces.id }).from(customers)
		.innerJoin(workspaceMemberships, and(eq(workspaceMemberships.customerId, customers.id), eq(workspaceMemberships.status, 'active'), isNull(workspaceMemberships.deletedAt)))
		.innerJoin(workspaces, and(eq(workspaces.id, workspaceMemberships.workspaceId), eq(workspaces.publicId, workspacePublicId), isNull(workspaces.deletedAt)))
		.innerJoin(applicationBuilds, and(eq(applicationBuilds.workspaceId, workspaces.id), eq(applicationBuilds.id, applicationId), isNull(applicationBuilds.deletedAt)))
		.innerJoin(runtimeImages, eq(runtimeImages.id, applicationBuilds.runtimeImageId))
		.leftJoin(workspaceResources, eq(workspaceResources.id, applicationBuilds.resourceId))
		.where(and(eq(customers.userId, actor.userId), isNull(customers.deletedAt))).limit(1);
	if (!application) throw new Error('Application not found.');
	return { ...application, actorUserId: actor.userId };
}

async function limits(workspaceId: string) {
	const [enabled, jobs, interval, timeout] = await Promise.all([
		effectiveEntitlement(workspaceId, 'cron.enabled'),
		effectiveEntitlement(workspaceId, 'cron.jobs_per_application'),
		effectiveEntitlement(workspaceId, 'cron.minimum_interval_minutes'),
		effectiveEntitlement(workspaceId, 'cron.timeout_seconds'),
	]);
	return { allowed: enabled.booleanValue === true, maximumJobs: jobs.isUnlimited ? null : jobs.limit, minimumIntervalMinutes: Math.max(1, interval.limit), maximumTimeoutSeconds: timeout.isUnlimited ? 3600 : Math.max(1, Math.min(3600, timeout.limit)) };
}

async function validate(application: Awaited<ReturnType<typeof ownedApplication>>, input: CreateApplicationCronRequest) {
	if (application.language === 'static') throw new Error('Static applications do not support scheduled tasks.');
	if (!application.providerId) throw new Error('Deploy the application before adding scheduled tasks.');
	const plan = await limits(application.workspaceId);
	if (!plan.allowed) throw new Error('Scheduled tasks are not included in this workspace plan.');
	const actualInterval = cronMinimumIntervalMinutes(input.frequency);
	if (actualInterval < plan.minimumIntervalMinutes) throw new Error(`This plan allows a minimum interval of ${plan.minimumIntervalMinutes} minutes.`);
	if (input.timeoutSeconds > plan.maximumTimeoutSeconds) throw new Error(`This plan allows a maximum timeout of ${plan.maximumTimeoutSeconds} seconds.`);
	return { plan, resolved: resolveApplicationCronCommand(application.framework, input.command) };
}

export class ApplicationCronController {
	public static async index(request: Request, workspaceId: number, applicationId: string, metadata: RequestMetadata): Promise<Response> {
		try {
			const application = await ownedApplication(request, workspaceId, applicationId, metadata);
			const plan = await limits(application.workspaceId);
			const rows = await db.select().from(applicationCronJobs).where(and(eq(applicationCronJobs.applicationBuildId, application.id), isNull(applicationCronJobs.deletedAt))).orderBy(asc(applicationCronJobs.name));
			let preset: ReturnType<typeof resolveApplicationCronCommand> | null = null;
			try { preset = resolveApplicationCronCommand(application.framework, 'command'); } catch { /* Static applications intentionally have no scheduler. */ }
			return resp.success('Application scheduled tasks retrieved.', { application: { framework: application.framework, language: application.language, deployed: Boolean(application.providerId) }, jobs: rows, limits: plan, preset: preset ? { ...preset, command: preset.editable ? null : preset.command } : null });
		} catch (error) { return resp.failure(error instanceof Error ? error.message : 'Application not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); }
	}

	public static async create(request: Request, workspaceId: number, applicationId: string, input: CreateApplicationCronRequest, metadata: RequestMetadata): Promise<Response> {
		try {
			const application = await ownedApplication(request, workspaceId, applicationId, metadata);
			const { plan, resolved } = await validate(application, input);
			const [{ value }] = await db.select({ value: count() }).from(applicationCronJobs).where(and(eq(applicationCronJobs.applicationBuildId, application.id), isNull(applicationCronJobs.deletedAt)));
			if (plan.maximumJobs !== null && Number(value) >= plan.maximumJobs) throw new Error(`This plan allows ${plan.maximumJobs} scheduled task(s) per application.`);
			const provider = await hostingProvider();
			const task = await provider.createApplicationScheduledTask(application.providerId!, { command: resolved.command, enabled: input.isEnabled, frequency: input.frequency, name: input.name, timeout: input.timeoutSeconds });
			const [row] = await db.insert(applicationCronJobs).values({ workspaceId: application.workspaceId, applicationBuildId: application.id, name: input.name, command: resolved.command, frequency: input.frequency, timeoutSeconds: input.timeoutSeconds, isEnabled: input.isEnabled, providerTaskUuid: task.uuid, syncStatus: 'synchronized', lastSynchronizedAt: new Date() }).returning();
			await recordAuditLog({ action: 'application_cron.created', actorUserId: application.actorUserId, ipAddress: metadata.ipAddress, metadata: { frequency: input.frequency }, resourceId: row?.id, resourceType: 'application_cron_job', userAgent: metadata.userAgent });
			return resp.success('Scheduled task created.', row, resp.codes.CREATED, undefined, 201);
		} catch (error) { return resp.failure(error instanceof Error ? error.message : 'Unable to create scheduled task.', resp.codes.GENERAL_BUSINESS_LOGIC_ERROR, undefined, null, undefined, 422); }
	}

	public static async update(request: Request, workspaceId: number, applicationId: string, cronId: string, input: CreateApplicationCronRequest, metadata: RequestMetadata): Promise<Response> {
		try {
			const application = await ownedApplication(request, workspaceId, applicationId, metadata);
			const { resolved } = await validate(application, input);
			const [existing] = await db.select().from(applicationCronJobs).where(and(eq(applicationCronJobs.id, cronId), eq(applicationCronJobs.applicationBuildId, application.id), isNull(applicationCronJobs.deletedAt))).limit(1);
			if (!existing?.providerTaskUuid) throw new Error('Scheduled task is not synchronized.');
			await (await hostingProvider()).updateApplicationScheduledTask(application.providerId!, existing.providerTaskUuid, { command: resolved.command, enabled: input.isEnabled, frequency: input.frequency, name: input.name, timeout: input.timeoutSeconds });
			const [row] = await db.update(applicationCronJobs).set({ name: input.name, command: resolved.command, frequency: input.frequency, timeoutSeconds: input.timeoutSeconds, isEnabled: input.isEnabled, syncStatus: 'synchronized', lastSyncError: null, lastSynchronizedAt: new Date(), updatedAt: new Date() }).where(eq(applicationCronJobs.id, existing.id)).returning();
			await recordAuditLog({ action: 'application_cron.updated', actorUserId: application.actorUserId, ipAddress: metadata.ipAddress, resourceId: existing.id, resourceType: 'application_cron_job', userAgent: metadata.userAgent });
			return resp.success('Scheduled task updated.', row, resp.codes.UPDATED);
		} catch (error) { return resp.failure(error instanceof Error ? error.message : 'Unable to update scheduled task.', resp.codes.GENERAL_BUSINESS_LOGIC_ERROR, undefined, null, undefined, 422); }
	}

	public static async remove(request: Request, workspaceId: number, applicationId: string, cronId: string, metadata: RequestMetadata): Promise<Response> {
		try {
			const application = await ownedApplication(request, workspaceId, applicationId, metadata);
			const [existing] = await db.select().from(applicationCronJobs).where(and(eq(applicationCronJobs.id, cronId), eq(applicationCronJobs.applicationBuildId, application.id), isNull(applicationCronJobs.deletedAt))).limit(1);
			if (!existing) throw new Error('Scheduled task not found.');
			if (existing.providerTaskUuid && application.providerId) await (await hostingProvider()).deleteApplicationScheduledTask(application.providerId, existing.providerTaskUuid);
			await db.update(applicationCronJobs).set({ deletedAt: new Date(), deleteReason: 'Deleted by workspace user.', updatedAt: new Date() }).where(eq(applicationCronJobs.id, existing.id));
			await recordAuditLog({ action: 'application_cron.deleted', actorUserId: application.actorUserId, ipAddress: metadata.ipAddress, resourceId: existing.id, resourceType: 'application_cron_job', userAgent: metadata.userAgent });
			return resp.success('Scheduled task deleted.', null, resp.codes.UPDATED);
		} catch (error) { return resp.failure(error instanceof Error ? error.message : 'Unable to delete scheduled task.', resp.codes.GENERAL_BUSINESS_LOGIC_ERROR, undefined, null, undefined, 422); }
	}

	public static async executions(request: Request, workspaceId: number, applicationId: string, cronId: string, metadata: RequestMetadata): Promise<Response> {
		try {
			const application = await ownedApplication(request, workspaceId, applicationId, metadata);
			const [existing] = await db.select().from(applicationCronJobs).where(and(eq(applicationCronJobs.id, cronId), eq(applicationCronJobs.applicationBuildId, application.id), isNull(applicationCronJobs.deletedAt))).limit(1);
			if (!existing?.providerTaskUuid || !application.providerId) throw new Error('Scheduled task is not synchronized.');
			return resp.success('Scheduled task execution history retrieved.', await (await hostingProvider()).listApplicationScheduledTaskExecutions(application.providerId, existing.providerTaskUuid));
		} catch (error) { return resp.failure(error instanceof Error ? error.message : 'Execution history unavailable.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); }
	}
}

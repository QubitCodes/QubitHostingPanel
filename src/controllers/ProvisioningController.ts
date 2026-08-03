import { and, desc, eq, isNull } from 'drizzle-orm';
import { resp } from '@qubitcodes/qcresp';

import { getEnvironment } from '@config/env';
import { db } from '@db/client';
import { customers, provisioningJobs, workspaceMemberships, workspaceResources, workspaces } from '@db/schema';
import { authenticateSession } from '@services/auth/authenticatedSessionService';
import { hostingProvider } from '@services/hosting/hostingProviderFactory';
import { processProvisioningJobs } from '@services/provisioning/provisioningService';
import type { RequestMetadata } from '@utils/request';

/** Exposes authorized resource status and protected worker operations. */
export class ProvisioningController {
	public static async workspaceResources(request: Request, workspacePublicId: number, metadata: RequestMetadata): Promise<Response> {
		try {
			const authenticated = await authenticateSession(request, metadata);
			const rows = await db.select({ id: provisioningJobs.id, kind: workspaceResources.kind, name: workspaceResources.name, status: workspaceResources.status, publicUrl: workspaceResources.publicUrl, provider: provisioningJobs.provider, providerResourceId: workspaceResources.providerResourceId, lastReconciledAt: workspaceResources.lastReconciledAt, jobStatus: provisioningJobs.status, lastError: provisioningJobs.lastError, attempts: provisioningJobs.attemptCount }).from(customers).innerJoin(workspaceMemberships, and(eq(workspaceMemberships.customerId, customers.id), eq(workspaceMemberships.status, 'active'), isNull(workspaceMemberships.deletedAt))).innerJoin(workspaces, and(eq(workspaces.id, workspaceMemberships.workspaceId), eq(workspaces.publicId, workspacePublicId), isNull(workspaces.deletedAt))).leftJoin(provisioningJobs, and(eq(provisioningJobs.workspaceId, workspaces.id), isNull(provisioningJobs.deletedAt))).leftJoin(workspaceResources, and(eq(workspaceResources.provisioningJobId, provisioningJobs.id), isNull(workspaceResources.deletedAt))).where(and(eq(customers.userId, authenticated.userId), isNull(customers.deletedAt))).orderBy(desc(provisioningJobs.createdAt));
			return resp.success('Workspace resources retrieved.', rows.filter(({ id }) => id));
		} catch { return resp.failure('Authentication required.', resp.codes.AUTHENTICATION_ERROR, undefined, null, undefined, 401); }
	}

	public static async process(request: Request): Promise<Response> {
		const environment = getEnvironment(); const supplied = request.headers.get('x-internal-job-secret');
		if (!environment.INTERNAL_JOB_SECRET || supplied !== environment.INTERNAL_JOB_SECRET) return resp.failure('Resource not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
		return resp.success('Provisioning jobs processed.', await processProvisioningJobs(10));
	}

	public static async health(request: Request): Promise<Response> {
		const environment = getEnvironment(); const supplied = request.headers.get('x-internal-job-secret');
		if (!environment.INTERNAL_JOB_SECRET || supplied !== environment.INTERNAL_JOB_SECRET) return resp.failure('Resource not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
		try { return resp.success('Hosting provider connected.', await hostingProvider().validateConnection()); } catch (error) { return resp.failure(error instanceof Error ? error.message : 'Hosting provider unavailable.', resp.codes.EXTERNAL_SERVICE_ERROR, undefined, null, undefined, 502); }
	}
}

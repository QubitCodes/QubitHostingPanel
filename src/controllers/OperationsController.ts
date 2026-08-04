import { and, desc, eq, isNull } from 'drizzle-orm';
import { resp } from '@qubitcodes/qcresp';

import { db } from '@db/client';
import { customerCheckouts, paymentAttempts, provisioningJobs, workspaceResources, workspaces } from '@db/schema';
import { authorizeAdmin } from '@services/authorization/adminAuthorizationService';
import { hostingProvider } from '@services/hosting/hostingProviderFactory';
import type { RequestMetadata } from '@utils/request';

/** Operational payment and provisioning visibility for authorized administrators. */
export class OperationsController {
	public static async payments(request: Request, metadata: RequestMetadata): Promise<Response> {
		try { await authorizeAdmin(request, 'payments.view', metadata); const rows = await db.select({ id: paymentAttempts.id, checkoutId: customerCheckouts.publicId, provider: paymentAttempts.provider, status: paymentAttempts.status, amountMinor: paymentAttempts.amountMinor, currency: paymentAttempts.currency, customerName: paymentAttempts.customerName, customerEmail: paymentAttempts.customerEmail, providerOrderId: paymentAttempts.providerOrderId, providerPaymentId: paymentAttempts.providerPaymentId, failureMessage: paymentAttempts.failureMessage, createdAt: paymentAttempts.createdAt, verifiedAt: paymentAttempts.verifiedAt }).from(paymentAttempts).innerJoin(customerCheckouts, eq(customerCheckouts.id, paymentAttempts.checkoutId)).where(and(isNull(paymentAttempts.deletedAt), isNull(customerCheckouts.deletedAt))).orderBy(desc(paymentAttempts.createdAt)).limit(200); return resp.success('Payment attempts retrieved.', rows); } catch { return resp.failure('Permission denied.', resp.codes.PERMISSION_DENIED, undefined, null, undefined, 403); }
	}

	public static async jobs(request: Request, metadata: RequestMetadata): Promise<Response> {
		try { await authorizeAdmin(request, 'provisioning.view', metadata); const rows = await db.select({ id: provisioningJobs.id, workspaceId: workspaces.publicId, workspaceName: workspaces.name, provider: provisioningJobs.provider, status: provisioningJobs.status, attemptCount: provisioningJobs.attemptCount, maximumAttempts: provisioningJobs.maximumAttempts, lastError: provisioningJobs.lastError, nextAttemptAt: provisioningJobs.nextAttemptAt, createdAt: provisioningJobs.createdAt, completedAt: provisioningJobs.completedAt, resourceId: workspaceResources.providerResourceId, resourceStatus: workspaceResources.status, publicUrl: workspaceResources.publicUrl }).from(provisioningJobs).innerJoin(workspaces, eq(workspaces.id, provisioningJobs.workspaceId)).leftJoin(workspaceResources, and(eq(workspaceResources.provisioningJobId, provisioningJobs.id), isNull(workspaceResources.deletedAt))).where(and(isNull(provisioningJobs.deletedAt), isNull(workspaces.deletedAt))).orderBy(desc(provisioningJobs.createdAt)).limit(200); return resp.success('Provisioning jobs retrieved.', rows); } catch { return resp.failure('Permission denied.', resp.codes.PERMISSION_DENIED, undefined, null, undefined, 403); }
	}

	public static async retry(request: Request, jobId: string, metadata: RequestMetadata): Promise<Response> {
		try { await authorizeAdmin(request, 'provisioning.update', metadata); const [job] = await db.select().from(provisioningJobs).where(and(eq(provisioningJobs.id, jobId), isNull(provisioningJobs.deletedAt))).limit(1); if (!job || !['failed', 'cancelled'].includes(job.status)) return resp.failure('Provisioning job is not retryable.', resp.codes.GENERAL_BUSINESS_LOGIC_ERROR, undefined, null, undefined, 422); await db.update(provisioningJobs).set({ status: 'queued', maximumAttempts: Math.max(job.maximumAttempts, job.attemptCount + 1), nextAttemptAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(provisioningJobs.id, job.id)); return resp.success('Provisioning retry queued.', undefined, resp.codes.ACCEPTED, undefined, 202); } catch { return resp.failure('Permission denied.', resp.codes.PERMISSION_DENIED, undefined, null, undefined, 403); }
	}

	public static async providerHealth(request: Request, metadata: RequestMetadata): Promise<Response> {
		try { await authorizeAdmin(request, 'provisioning.view', metadata); return resp.success('Hosting provider connected.', await (await hostingProvider()).validateConnection()); } catch (error) { return resp.failure(error instanceof Error ? error.message : 'Provider unavailable.', resp.codes.EXTERNAL_SERVICE_ERROR, undefined, null, undefined, 502); }
	}
}

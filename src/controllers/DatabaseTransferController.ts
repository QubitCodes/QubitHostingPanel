import { Readable } from 'node:stream';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { resp } from '@qubitcodes/qcresp';

import { explorerAccess } from '@controllers/DatabaseExplorerController';
import { db } from '@db/client';
import { databaseTransferJobs } from '@db/schema';
import type { DatabaseImportRequest, DatabaseTransferExportRequest } from '@schemas/databaseTransfer';
import { recordAuditLog } from '@services/auditLogService';
import { authenticationFailureResponse } from '@services/auth/authenticationFailureService';
import { databaseTransferArtifactService } from '@services/databases/databaseTransferArtifactService';
import { enqueueDatabaseExport, enqueueDatabaseImport, publicTransferJob, requestTransferAction } from '@services/databases/databaseTransferJobService';
import { DatabaseTransferService } from '@services/databases/databaseTransferService';
import type { RequestMetadata } from '@utils/request';

const transfers = new DatabaseTransferService();

/** Workspace-authorized native import/export lifecycle. */
export class DatabaseTransferController {
	public static async stage(request: Request, workspacePublicId: number, databaseId: string, file: File, metadata: RequestMetadata): Promise<Response> {
		try { const access = await explorerAccess(request, workspacePublicId, databaseId, metadata); const staged = await transfers.stage(file, access.connection.engine, { actorUserId: access.actorUserId, databaseId, workspaceId: access.workspaceId }); await recordAuditLog({ actorUserId: access.actorUserId, action: 'logical_database.import_staged', resourceType: 'logical_database', resourceId: databaseId, metadata: { workspacePublicId, format: staged.format, size: staged.size }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent }); return resp.success('Import file staged.', staged, resp.codes.CREATED, undefined, 201); }
		catch (error) { return authenticationFailureResponse(error) ?? resp.failure(error instanceof Error ? error.message : 'Unable to stage import.', resp.codes.GENERAL_BUSINESS_LOGIC_ERROR, undefined, null, undefined, 422); }
	}

	public static async import(request: Request, workspacePublicId: number, databaseId: string, input: DatabaseImportRequest, metadata: RequestMetadata): Promise<Response> {
		let actorUserId: string | undefined;
		try { const access = await explorerAccess(request, workspacePublicId, databaseId, metadata); actorUserId = access.actorUserId; if (input.confirmation !== access.databaseName) return resp.failure('Confirmation must exactly match the database name.', resp.codes.VALIDATION_ERROR, [{ field: 'confirmation', message: 'Database name does not match.' }], null, undefined, 400); const job = await enqueueDatabaseImport(input, { actorUserId: access.actorUserId, databaseId, workspaceId: access.workspaceId }); await recordAuditLog({ actorUserId: access.actorUserId, action: 'logical_database.transfer_import_queued', resourceType: 'database_transfer_job', resourceId: job.id, metadata: { workspacePublicId, databaseId, format: job.format, mode: input.mode, scope: job.scope }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent }); return resp.success('Database import queued. A safety backup will run first.', publicTransferJob(job), resp.codes.ACCEPTED, undefined, 202); }
		catch (error) { const authenticationFailure = authenticationFailureResponse(error); if (authenticationFailure) return authenticationFailure; if (actorUserId) await recordAuditLog({ actorUserId, action: 'logical_database.transfer_import_queue_failed', resourceType: 'logical_database', resourceId: databaseId, metadata: { workspacePublicId, mode: input.mode }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent }).catch(() => undefined); return resp.failure(error instanceof Error ? error.message : 'Database import could not be queued.', resp.codes.GENERAL_BUSINESS_LOGIC_ERROR, undefined, null, undefined, 422); }
	}

	public static async export(request: Request, workspacePublicId: number, databaseId: string, metadata: RequestMetadata): Promise<Response> {
		try { const access = await explorerAccess(request, workspacePublicId, databaseId, metadata); const result = transfers.export(access.connection); await recordAuditLog({ actorUserId: access.actorUserId, action: 'logical_database.export_started', resourceType: 'logical_database', resourceId: databaseId, metadata: { workspacePublicId, engine: access.connection.engine }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent }); return new Response(Readable.toWeb(result.stream) as ReadableStream, { headers: { 'cache-control': 'no-store', 'content-disposition': `attachment; filename="${result.filename}"`, 'content-type': 'application/octet-stream' } }); }
		catch (error) { return authenticationFailureResponse(error) ?? resp.failure(error instanceof Error ? error.message : 'Database export failed.', resp.codes.INTERNAL_SERVICE_ERROR, undefined, null, undefined, 500); }
	}

	public static async jobs(request: Request, workspacePublicId: number, databaseId: string, metadata: RequestMetadata): Promise<Response> {
		try { const access = await explorerAccess(request, workspacePublicId, databaseId, metadata); const jobs = await db.select().from(databaseTransferJobs).where(and(eq(databaseTransferJobs.workspaceId, access.workspaceId), eq(databaseTransferJobs.logicalDatabaseId, databaseId), eq(databaseTransferJobs.requestedByUserId, access.actorUserId), isNull(databaseTransferJobs.deletedAt))).orderBy(desc(databaseTransferJobs.createdAt)).limit(50); return resp.success('Database transfer jobs retrieved.', jobs.map(publicTransferJob)); }
		catch (error) { return authenticationFailureResponse(error) ?? resp.failure(error instanceof Error ? error.message : 'Unable to retrieve transfer jobs.', resp.codes.GENERAL_BUSINESS_LOGIC_ERROR, undefined, null, undefined, 422); }
	}

	public static async queueExport(request: Request, workspacePublicId: number, databaseId: string, input: DatabaseTransferExportRequest, metadata: RequestMetadata): Promise<Response> {
		try { const access = await explorerAccess(request, workspacePublicId, databaseId, metadata); const job = await enqueueDatabaseExport(input, { actorUserId: access.actorUserId, databaseId, workspaceId: access.workspaceId }); await recordAuditLog({ actorUserId: access.actorUserId, action: 'logical_database.transfer_export_queued', resourceType: 'database_transfer_job', resourceId: job.id, metadata: { workspacePublicId, databaseId, format: job.format, scope: job.scope }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent }); return resp.success('Database export queued.', publicTransferJob(job), resp.codes.ACCEPTED, undefined, 202); }
		catch (error) { return authenticationFailureResponse(error) ?? resp.failure(error instanceof Error ? error.message : 'Database export could not be queued.', resp.codes.GENERAL_BUSINESS_LOGIC_ERROR, undefined, null, undefined, 422); }
	}

	public static async action(request: Request, workspacePublicId: number, databaseId: string, jobId: string, action: 'cancel' | 'retry', metadata: RequestMetadata): Promise<Response> {
		try { const access = await explorerAccess(request, workspacePublicId, databaseId, metadata); const job = await requestTransferAction(jobId, access.workspaceId, databaseId, access.actorUserId, action); if (!job) return resp.failure(`Transfer cannot be ${action === 'cancel' ? 'cancelled' : 'retried'}.`, resp.codes.ORDER_CANNOT_BE_PROCESSED, undefined, null, undefined, 422); await recordAuditLog({ actorUserId: access.actorUserId, action: `logical_database.transfer_${action}_requested`, resourceType: 'database_transfer_job', resourceId: job.id, metadata: { workspacePublicId, databaseId }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent }); return resp.success(action === 'cancel' ? 'Transfer cancellation requested.' : 'Transfer queued for retry.', publicTransferJob(job), resp.codes.UPDATED); }
		catch (error) { return authenticationFailureResponse(error) ?? resp.failure(error instanceof Error ? error.message : 'Unable to update transfer.', resp.codes.GENERAL_BUSINESS_LOGIC_ERROR, undefined, null, undefined, 422); }
	}

	public static async download(request: Request, workspacePublicId: number, databaseId: string, jobId: string, metadata: RequestMetadata): Promise<Response> {
		try { const access = await explorerAccess(request, workspacePublicId, databaseId, metadata); const [job] = await db.select().from(databaseTransferJobs).where(and(eq(databaseTransferJobs.id, jobId), eq(databaseTransferJobs.workspaceId, access.workspaceId), eq(databaseTransferJobs.logicalDatabaseId, databaseId), eq(databaseTransferJobs.requestedByUserId, access.actorUserId), eq(databaseTransferJobs.status, 'completed'), isNull(databaseTransferJobs.deletedAt))).limit(1); if (!job?.outputStorageKey || !job.outputChecksumSha256 || !job.outputName || (job.expiresAt && job.expiresAt <= new Date())) return resp.failure('Transfer artifact not found or expired.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); const bytes = await databaseTransferArtifactService.read(job.outputStorageKey, job.outputChecksumSha256); await recordAuditLog({ actorUserId: access.actorUserId, action: 'logical_database.transfer_downloaded', resourceType: 'database_transfer_job', resourceId: job.id, metadata: { workspacePublicId, databaseId, format: job.format, sizeBytes: bytes.length }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent }); return new Response(new Uint8Array(bytes), { headers: { 'cache-control': 'no-store', 'content-disposition': `attachment; filename="${job.outputName.replace(/["\r\n]/g, '_')}"`, 'content-type': job.format === 'csv' ? 'text/csv; charset=utf-8' : job.format === 'json' ? 'application/json; charset=utf-8' : 'application/octet-stream' } }); }
		catch (error) { return authenticationFailureResponse(error) ?? resp.failure(error instanceof Error ? error.message : 'Unable to download transfer.', resp.codes.INTERNAL_SERVICE_ERROR, undefined, null, undefined, 500); }
	}
}

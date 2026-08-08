import { Readable } from 'node:stream';
import { resp } from '@qubitcodes/qcresp';

import { explorerAccess } from '@controllers/DatabaseExplorerController';
import type { DatabaseImportRequest } from '@schemas/databaseTransfer';
import { recordAuditLog } from '@services/auditLogService';
import { authenticationFailureResponse } from '@services/auth/authenticationFailureService';
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
		try { const access = await explorerAccess(request, workspacePublicId, databaseId, metadata); actorUserId = access.actorUserId; if (input.confirmation !== access.databaseName) return resp.failure('Confirmation must exactly match the database name.', resp.codes.VALIDATION_ERROR, [{ field: 'confirmation', message: 'Database name does not match.' }], null, undefined, 400); const result = await transfers.import(access.connection, input, { actorUserId: access.actorUserId, databaseId, workspaceId: access.workspaceId }); await recordAuditLog({ actorUserId: access.actorUserId, action: 'logical_database.import_completed', resourceType: 'logical_database', resourceId: databaseId, metadata: { workspacePublicId, format: result.format, mode: input.mode, size: result.size }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent }); return resp.success('Database import completed.', result, resp.codes.UPDATED); }
		catch (error) { const authenticationFailure = authenticationFailureResponse(error); if (authenticationFailure) return authenticationFailure; if (actorUserId) await recordAuditLog({ actorUserId, action: 'logical_database.import_failed', resourceType: 'logical_database', resourceId: databaseId, metadata: { workspacePublicId, mode: input.mode }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent }).catch(() => undefined); return resp.failure(error instanceof Error ? error.message : 'Database import failed.', resp.codes.INTERNAL_SERVICE_ERROR, undefined, null, undefined, 500); }
	}

	public static async export(request: Request, workspacePublicId: number, databaseId: string, metadata: RequestMetadata): Promise<Response> {
		try { const access = await explorerAccess(request, workspacePublicId, databaseId, metadata); const result = transfers.export(access.connection); await recordAuditLog({ actorUserId: access.actorUserId, action: 'logical_database.export_started', resourceType: 'logical_database', resourceId: databaseId, metadata: { workspacePublicId, engine: access.connection.engine }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent }); return new Response(Readable.toWeb(result.stream) as ReadableStream, { headers: { 'cache-control': 'no-store', 'content-disposition': `attachment; filename="${result.filename}"`, 'content-type': 'application/octet-stream' } }); }
		catch (error) { return authenticationFailureResponse(error) ?? resp.failure(error instanceof Error ? error.message : 'Database export failed.', resp.codes.INTERNAL_SERVICE_ERROR, undefined, null, undefined, 500); }
	}
}

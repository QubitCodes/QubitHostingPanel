import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { resp } from '@qubitcodes/qcresp';

import { explorerAccess } from '@controllers/DatabaseExplorerController';
import { db } from '@db/client';
import { databaseSavedQueries } from '@db/schema';
import type { DatabaseSavedQueryCreate, DatabaseSavedQueryUpdate } from '@schemas/databaseQuery';
import { recordAuditLog } from '@services/auditLogService';
import { authenticationFailureResponse } from '@services/auth/authenticationFailureService';
import { decryptCredential, encryptCredential } from '@services/encryption/credentialEncryptionService';
import type { RequestMetadata } from '@utils/request';

function savedQueryPayload(record: typeof databaseSavedQueries.$inferSelect) {
	return {
		id: record.id,
		name: record.name,
		description: record.description,
		query: decryptCredential(record.queryCiphertext),
		allowChanges: record.allowChanges,
		rowLimit: record.rowLimit,
		isFavorite: record.isFavorite,
		executionCount: record.executionCount,
		lastExecutedAt: record.lastExecutedAt,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
	};
}

/** Persistent encrypted SQL snippets scoped to one database and user. */
export class DatabaseSavedQueryController {
	public static async list(request: Request, workspacePublicId: number, databaseId: string, metadata: RequestMetadata): Promise<Response> {
		try {
			const access = await explorerAccess(request, workspacePublicId, databaseId, metadata);
			const records = await db.select().from(databaseSavedQueries).where(and(eq(databaseSavedQueries.workspaceId, access.workspaceId), eq(databaseSavedQueries.logicalDatabaseId, databaseId), eq(databaseSavedQueries.ownerUserId, access.actorUserId), isNull(databaseSavedQueries.deletedAt))).orderBy(desc(databaseSavedQueries.isFavorite), asc(databaseSavedQueries.name));
			await recordAuditLog({ actorUserId: access.actorUserId, action: 'logical_database.saved_queries_viewed', resourceType: 'logical_database', resourceId: databaseId, metadata: { workspacePublicId, count: records.length }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent });
			return resp.success('Saved queries retrieved.', records.map(savedQueryPayload));
		} catch (error) {
			return authenticationFailureResponse(error) ?? resp.failure(error instanceof Error ? error.message : 'Unable to retrieve saved queries.', resp.codes.GENERAL_BUSINESS_LOGIC_ERROR, undefined, null, undefined, 422);
		}
	}

	public static async create(request: Request, workspacePublicId: number, databaseId: string, input: DatabaseSavedQueryCreate, metadata: RequestMetadata): Promise<Response> {
		try {
			const access = await explorerAccess(request, workspacePublicId, databaseId, metadata);
			const [created] = await db.insert(databaseSavedQueries).values({ workspaceId: access.workspaceId, logicalDatabaseId: databaseId, ownerUserId: access.actorUserId, name: input.name, description: input.description || null, queryCiphertext: encryptCredential(input.query), allowChanges: input.allowChanges, rowLimit: input.rowLimit, isFavorite: input.isFavorite }).returning();
			await recordAuditLog({ actorUserId: access.actorUserId, action: 'logical_database.saved_query_created', resourceType: 'database_saved_query', resourceId: created.id, metadata: { workspacePublicId, databaseId, name: created.name, allowChanges: created.allowChanges }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent });
			return resp.success('Query saved.', savedQueryPayload(created), resp.codes.CREATED, undefined, 201);
		} catch (error) {
			return authenticationFailureResponse(error) ?? resp.failure(error instanceof Error && /unique|duplicate/i.test(error.message) ? 'A saved query with this name already exists.' : error instanceof Error ? error.message : 'Unable to save query.', resp.codes.GENERAL_BUSINESS_LOGIC_ERROR, undefined, null, undefined, 422);
		}
	}

	public static async update(request: Request, workspacePublicId: number, databaseId: string, savedQueryId: string, input: DatabaseSavedQueryUpdate, metadata: RequestMetadata): Promise<Response> {
		try {
			const access = await explorerAccess(request, workspacePublicId, databaseId, metadata);
			const [updated] = await db.update(databaseSavedQueries).set({ ...(input.name !== undefined ? { name: input.name } : {}), ...(input.description !== undefined ? { description: input.description || null } : {}), ...(input.query !== undefined ? { queryCiphertext: encryptCredential(input.query) } : {}), ...(input.allowChanges !== undefined ? { allowChanges: input.allowChanges } : {}), ...(input.rowLimit !== undefined ? { rowLimit: input.rowLimit } : {}), ...(input.isFavorite !== undefined ? { isFavorite: input.isFavorite } : {}), updatedAt: new Date() }).where(and(eq(databaseSavedQueries.id, savedQueryId), eq(databaseSavedQueries.workspaceId, access.workspaceId), eq(databaseSavedQueries.logicalDatabaseId, databaseId), eq(databaseSavedQueries.ownerUserId, access.actorUserId), isNull(databaseSavedQueries.deletedAt))).returning();
			if (!updated) return resp.failure('Saved query not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
			await recordAuditLog({ actorUserId: access.actorUserId, action: 'logical_database.saved_query_updated', resourceType: 'database_saved_query', resourceId: updated.id, metadata: { workspacePublicId, databaseId, changedFields: Object.keys(input).filter((key) => key !== 'query'), queryChanged: input.query !== undefined }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent });
			return resp.success('Saved query updated.', savedQueryPayload(updated), resp.codes.UPDATED);
		} catch (error) {
			return authenticationFailureResponse(error) ?? resp.failure(error instanceof Error && /unique|duplicate/i.test(error.message) ? 'A saved query with this name already exists.' : error instanceof Error ? error.message : 'Unable to update saved query.', resp.codes.GENERAL_BUSINESS_LOGIC_ERROR, undefined, null, undefined, 422);
		}
	}

	public static async remove(request: Request, workspacePublicId: number, databaseId: string, savedQueryId: string, metadata: RequestMetadata): Promise<Response> {
		try {
			const access = await explorerAccess(request, workspacePublicId, databaseId, metadata);
			const deletedAt = new Date();
			const [removed] = await db.update(databaseSavedQueries).set({ deletedAt, deleteReason: 'Removed by query owner.', updatedAt: deletedAt }).where(and(eq(databaseSavedQueries.id, savedQueryId), eq(databaseSavedQueries.workspaceId, access.workspaceId), eq(databaseSavedQueries.logicalDatabaseId, databaseId), eq(databaseSavedQueries.ownerUserId, access.actorUserId), isNull(databaseSavedQueries.deletedAt))).returning({ id: databaseSavedQueries.id });
			if (!removed) return resp.failure('Saved query not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
			await recordAuditLog({ actorUserId: access.actorUserId, action: 'logical_database.saved_query_deleted', resourceType: 'database_saved_query', resourceId: removed.id, metadata: { workspacePublicId, databaseId }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent });
			return resp.success('Saved query deleted.', { id: removed.id }, resp.codes.UPDATED);
		} catch (error) {
			return authenticationFailureResponse(error) ?? resp.failure(error instanceof Error ? error.message : 'Unable to delete saved query.', resp.codes.GENERAL_BUSINESS_LOGIC_ERROR, undefined, null, undefined, 422);
		}
	}

}

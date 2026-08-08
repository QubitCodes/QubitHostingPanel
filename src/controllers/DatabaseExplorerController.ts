import { and, eq, isNull, sql } from 'drizzle-orm';
import { resp } from '@qubitcodes/qcresp';

import { db } from '@db/client';
import { customers, databaseClusters, logicalDatabases, workspaceMemberships, workspaces, workspaceSubscriptions } from '@db/schema';
import type { DatabaseExplorerDeleteRows, DatabaseExplorerInsertRow, DatabaseExplorerObjectQuery, DatabaseExplorerRowsQuery, DatabaseExplorerUpdateRow } from '@schemas/databaseExplorer';
import type { DatabaseQueryRequest } from '@schemas/databaseQuery';
import type { DatabaseSchemaMutation } from '@schemas/databaseSchema';
import { recordAuditLog } from '@services/auditLogService';
import { authenticateSession } from '@services/auth/authenticatedSessionService';
import { authenticationFailureResponse } from '@services/auth/authenticationFailureService';
import { databaseClusterEndpoint } from '@services/databases/databaseClusterEndpointService';
import { DatabaseExplorerService, type DatabaseExplorerConnection } from '@services/databases/databaseExplorerService';
import { DatabaseQueryService } from '@services/databases/databaseQueryService';
import { DatabaseSchemaService } from '@services/databases/databaseSchemaService';
import { decryptCredential } from '@services/encryption/credentialEncryptionService';
import type { RequestMetadata } from '@utils/request';

export interface ExplorerAccess {
	actorUserId: string;
	connection: DatabaseExplorerConnection;
	databaseName: string;
	workspaceId: string;
}

/** Resolves one active workspace database without exposing its credential to the browser. */
export async function explorerAccess(request: Request, workspacePublicId: number, databaseId: string, metadata: RequestMetadata): Promise<ExplorerAccess> {
	const actor = await authenticateSession(request, metadata);
	const [record] = await db
		.select({
			cluster: databaseClusters,
			credentialCiphertext: logicalDatabases.credentialCiphertext,
			databaseName: logicalDatabases.databaseName,
			username: logicalDatabases.username,
			workspaceId: workspaces.id,
		})
		.from(customers)
		.innerJoin(workspaceMemberships, and(eq(workspaceMemberships.customerId, customers.id), eq(workspaceMemberships.status, 'active'), isNull(workspaceMemberships.deletedAt)))
		.innerJoin(workspaces, and(eq(workspaces.id, workspaceMemberships.workspaceId), eq(workspaces.publicId, workspacePublicId), eq(workspaces.status, 'active'), isNull(workspaces.deletedAt)))
		.innerJoin(workspaceSubscriptions, and(eq(workspaceSubscriptions.workspaceId, workspaces.id), eq(workspaceSubscriptions.isPrimary, true), sql`${workspaceSubscriptions.status} IN ('active', 'trialing')`, isNull(workspaceSubscriptions.deletedAt)))
		.innerJoin(logicalDatabases, and(eq(logicalDatabases.workspaceId, workspaces.id), eq(logicalDatabases.id, databaseId), eq(logicalDatabases.status, 'active'), isNull(logicalDatabases.deletedAt)))
		.innerJoin(databaseClusters, and(eq(databaseClusters.id, logicalDatabases.clusterId), isNull(databaseClusters.deletedAt)))
		.where(and(eq(customers.userId, actor.userId), isNull(customers.deletedAt)))
		.limit(1);
	if (!record) throw new Error('Database not found.');
	const credential = JSON.parse(decryptCredential(record.credentialCiphertext)) as { password?: unknown };
	if (typeof credential.password !== 'string' || !credential.password) throw new Error('Database credential is unavailable.');
	const endpoint = databaseClusterEndpoint(record.cluster);
	return {
		actorUserId: actor.userId,
		workspaceId: record.workspaceId,
		databaseName: record.databaseName,
		connection: {
			databaseName: record.databaseName,
			engine: record.cluster.engine,
			host: endpoint.host,
			password: credential.password,
			port: endpoint.port,
			tlsMode: endpoint.tlsMode,
			username: record.username,
		},
	};
}

/** Workspace-authorized database schema and data inspection endpoints. */
export class DatabaseExplorerController {
	/** Executes one bounded SQL workspace statement without logging its text or result values. */
	public static async query(request: Request, workspacePublicId: number, databaseId: string, input: DatabaseQueryRequest, metadata: RequestMetadata): Promise<Response> {
		let actorUserId: string | undefined;
		try {
			const access = await explorerAccess(request, workspacePublicId, databaseId, metadata);
			actorUserId = access.actorUserId;
			const result = await new DatabaseQueryService(access.connection).execute(input);
			await recordAuditLog({ actorUserId: access.actorUserId, action: result.readOnly ? 'logical_database.query_read' : 'logical_database.query_changed_data', resourceType: 'logical_database', resourceId: databaseId, metadata: { workspacePublicId, statementType: result.statementType, fingerprint: result.fingerprint, durationMs: result.durationMs, affectedRows: result.affectedRows, truncated: result.truncated }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent });
			return resp.success('Database query completed.', result);
		} catch (error) {
			const authenticationFailure = authenticationFailureResponse(error);
			if (authenticationFailure) return authenticationFailure;
			if (actorUserId) await recordAuditLog({ actorUserId, action: 'logical_database.query_failed', resourceType: 'logical_database', resourceId: databaseId, metadata: { workspacePublicId }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent }).catch(() => undefined);
			return resp.failure(error instanceof Error ? error.message : 'Database query failed.', resp.codes.GENERAL_BUSINESS_LOGIC_ERROR, undefined, null, undefined, 422);
		}
	}
	/** Applies one strictly modelled DDL operation to the selected logical database. */
	public static async schemaMutate(request: Request, workspacePublicId: number, databaseId: string, input: DatabaseSchemaMutation, metadata: RequestMetadata): Promise<Response> {
		let actorUserId: string | undefined;
		try {
			const access = await explorerAccess(request, workspacePublicId, databaseId, metadata);
			actorUserId = access.actorUserId;
			const result = await new DatabaseSchemaService(access.connection).mutate(input);
			await recordAuditLog({
				actorUserId: access.actorUserId,
				action: `logical_database.schema_${input.operation}`,
				resourceType: 'logical_database',
				resourceId: databaseId,
				metadata: {
					workspacePublicId,
					operation: input.operation,
					target: result.target,
				},
				ipAddress: metadata.ipAddress,
				userAgent: metadata.userAgent,
			});
			return resp.success('Database structure updated.', result, resp.codes.UPDATED);
		} catch (error) {
			const authenticationFailure = authenticationFailureResponse(error);
			if (authenticationFailure) return authenticationFailure;
			if (actorUserId) await recordAuditLog({
				actorUserId,
				action: 'logical_database.schema_mutation_failed',
				resourceType: 'logical_database',
				resourceId: databaseId,
				metadata: { workspacePublicId, operation: input.operation },
				ipAddress: metadata.ipAddress,
				userAgent: metadata.userAgent,
			}).catch(() => undefined);
			return resp.failure(error instanceof Error ? error.message : 'Unable to change database structure.', resp.codes.GENERAL_BUSINESS_LOGIC_ERROR, undefined, null, undefined, 422);
		}
	}

	public static async advancedObjects(request: Request, workspacePublicId: number, databaseId: string, metadata: RequestMetadata): Promise<Response> {
		try {
			const access = await explorerAccess(request, workspacePublicId, databaseId, metadata);
			const objects = await new DatabaseExplorerService(access.connection).listAdvancedObjects();
			await recordAuditLog({
				actorUserId: access.actorUserId,
				action: 'logical_database.advanced_objects_viewed',
				resourceType: 'logical_database',
				resourceId: databaseId,
				metadata: { workspacePublicId, objectCount: objects.length },
				ipAddress: metadata.ipAddress,
				userAgent: metadata.userAgent,
			});
			return resp.success('Database objects retrieved.', { databaseName: access.databaseName, objects });
		} catch (error) {
			const authenticationFailure = authenticationFailureResponse(error);
			if (authenticationFailure) return authenticationFailure;
			return resp.failure(error instanceof Error ? error.message : 'Unable to inspect database objects.', resp.codes.EXTERNAL_SERVICE_ERROR, undefined, null, undefined, 502);
		}
	}

	public static async objects(request: Request, workspacePublicId: number, databaseId: string, input: DatabaseExplorerObjectQuery, metadata: RequestMetadata): Promise<Response> {
		try {
			const access = await explorerAccess(request, workspacePublicId, databaseId, metadata);
			const explorer = new DatabaseExplorerService(access.connection);
			const [objects, schemas] = await Promise.all([explorer.listObjects(), explorer.listSchemas()]);
			const structure = input.schema && input.table ? await explorer.describeObject(input.schema, input.table) : null;
			await recordAuditLog({
				actorUserId: access.actorUserId,
				action: structure ? 'logical_database.structure_viewed' : 'logical_database.objects_viewed',
				resourceType: 'logical_database',
				resourceId: databaseId,
				metadata: { workspacePublicId, schema: input.schema, table: input.table, objectCount: objects.length },
				ipAddress: metadata.ipAddress,
				userAgent: metadata.userAgent,
			});
			return resp.success('Database objects retrieved.', { databaseName: access.databaseName, objects, schemas, structure });
		} catch (error) {
			const authenticationFailure = authenticationFailureResponse(error);
			if (authenticationFailure) return authenticationFailure;
			return resp.failure(error instanceof Error ? error.message : 'Unable to inspect database.', resp.codes.EXTERNAL_SERVICE_ERROR, undefined, null, undefined, 502);
		}
	}

	public static async rows(request: Request, workspacePublicId: number, databaseId: string, input: DatabaseExplorerRowsQuery, metadata: RequestMetadata): Promise<Response> {
		try {
			const access = await explorerAccess(request, workspacePublicId, databaseId, metadata);
			const result = await new DatabaseExplorerService(access.connection).listRows(input);
			await recordAuditLog({
				actorUserId: access.actorUserId,
				action: 'logical_database.rows_viewed',
				resourceType: 'logical_database',
				resourceId: databaseId,
				metadata: { workspacePublicId, schema: input.schema, table: input.table, page: input.page, pageSize: input.pageSize, filtered: Boolean(input.search) },
				ipAddress: metadata.ipAddress,
				userAgent: metadata.userAgent,
			});
			return resp.success('Database rows retrieved.', result);
		} catch (error) {
			const authenticationFailure = authenticationFailureResponse(error);
			if (authenticationFailure) return authenticationFailure;
			return resp.failure(error instanceof Error ? error.message : 'Unable to read database rows.', resp.codes.EXTERNAL_SERVICE_ERROR, undefined, null, undefined, 502);
		}
	}

	public static async mutate(request: Request, workspacePublicId: number, databaseId: string, operation: 'delete' | 'insert' | 'update', input: DatabaseExplorerDeleteRows | DatabaseExplorerInsertRow | DatabaseExplorerUpdateRow, metadata: RequestMetadata): Promise<Response> {
		try {
			const access = await explorerAccess(request, workspacePublicId, databaseId, metadata);
			const explorer = new DatabaseExplorerService(access.connection);
			const result = operation === 'insert'
				? await explorer.insertRow(input as DatabaseExplorerInsertRow)
				: operation === 'update'
					? await explorer.updateRow(input as DatabaseExplorerUpdateRow)
					: await explorer.deleteRows(input as DatabaseExplorerDeleteRows);
			const columns = operation === 'delete' ? [] : Object.keys((input as DatabaseExplorerInsertRow | DatabaseExplorerUpdateRow).values);
			await recordAuditLog({
				actorUserId: access.actorUserId,
				action: `logical_database.rows_${operation === 'insert' ? 'inserted' : operation === 'update' ? 'updated' : 'deleted'}`,
				resourceType: 'logical_database',
				resourceId: databaseId,
				metadata: { workspacePublicId, schema: input.schema, table: input.table, columns, affectedRows: result.affectedRows },
				ipAddress: metadata.ipAddress,
				userAgent: metadata.userAgent,
			});
			return resp.success(`Database rows ${operation === 'insert' ? 'inserted' : operation === 'update' ? 'updated' : 'deleted'}.`, result, operation === 'insert' ? resp.codes.CREATED : resp.codes.UPDATED, undefined, operation === 'insert' ? 201 : 200);
		} catch (error) {
			const authenticationFailure = authenticationFailureResponse(error);
			if (authenticationFailure) return authenticationFailure;
			return resp.failure(error instanceof Error ? error.message : 'Unable to change database rows.', resp.codes.GENERAL_BUSINESS_LOGIC_ERROR, undefined, null, undefined, 422);
		}
	}
}

import { Readable } from 'node:stream';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { resp } from '@qubitcodes/qcresp';

import { db } from '@db/client';
import { customers, databaseBackups, databaseClusters, logicalDatabases, workspaceMemberships, workspaces, workspaceSubscriptions } from '@db/schema';
import type { RestoreDatabaseBackupRequest } from '@schemas/databaseBackup';
import type { DestructiveActionRequest } from '@schemas/destructiveAction';
import { recordAuditLog } from '@services/auditLogService';
import { authenticateSession } from '@services/auth/authenticatedSessionService';
import { databaseBackupService, type DatabaseBackupConnection } from '@services/databases/databaseBackupService';
import { databaseClusterEndpoint } from '@services/databases/databaseClusterEndpointService';
import { decryptCredential } from '@services/encryption/credentialEncryptionService';
import type { RequestMetadata } from '@utils/request';

interface WorkspaceAccess { actorUserId: string; entitlementSnapshot: Array<Record<string, unknown>>; id: string }

async function workspaceAccess(request: Request, publicId: number, metadata: RequestMetadata): Promise<WorkspaceAccess> {
	const actor = await authenticateSession(request, metadata);
	const [workspace] = await db.select({ id: workspaces.id, entitlementSnapshot: workspaceSubscriptions.entitlementSnapshot }).from(customers).innerJoin(workspaceMemberships, and(eq(workspaceMemberships.customerId, customers.id), eq(workspaceMemberships.status, 'active'), isNull(workspaceMemberships.deletedAt))).innerJoin(workspaces, and(eq(workspaces.id, workspaceMemberships.workspaceId), eq(workspaces.publicId, publicId), eq(workspaces.status, 'active'), isNull(workspaces.deletedAt))).innerJoin(workspaceSubscriptions, and(eq(workspaceSubscriptions.workspaceId, workspaces.id), sql`${workspaceSubscriptions.status} IN ('active', 'trialing')`, isNull(workspaceSubscriptions.deletedAt))).where(and(eq(customers.userId, actor.userId), isNull(customers.deletedAt))).limit(1);
	if (!workspace) throw new Error('Workspace not found.');
	return { actorUserId: actor.userId, id: workspace.id, entitlementSnapshot: workspace.entitlementSnapshot };
}

function entitlement(snapshot: Array<Record<string, unknown>>, code: string): Record<string, unknown> | undefined { return snapshot.find((item) => item.code === code); }
function backupsEnabled(snapshot: Array<Record<string, unknown>>): boolean { const item = entitlement(snapshot, 'backups.enabled'); return item?.booleanValue === true || Number(item?.numericValue ?? 0) > 0; }
function retentionDays(snapshot: Array<Record<string, unknown>>): number { const item = entitlement(snapshot, 'backups.retention_days'); return Math.max(1, Math.min(365, Number(item?.numericValue ?? 7))); }

async function databaseRecord(workspaceId: string, databaseId: string) {
	const [record] = await db.select({ database: logicalDatabases, cluster: databaseClusters }).from(logicalDatabases).innerJoin(databaseClusters, eq(databaseClusters.id, logicalDatabases.clusterId)).where(and(eq(logicalDatabases.id, databaseId), eq(logicalDatabases.workspaceId, workspaceId), eq(logicalDatabases.status, 'active'), isNull(logicalDatabases.deletedAt), isNull(databaseClusters.deletedAt))).limit(1);
	return record;
}

function connection(record: NonNullable<Awaited<ReturnType<typeof databaseRecord>>>): DatabaseBackupConnection {
	const credential = JSON.parse(decryptCredential(record.database.credentialCiphertext)) as DatabaseBackupConnection; const endpoint = databaseClusterEndpoint(record.cluster);
	return { ...credential, engine: record.cluster.engine, host: endpoint.host, port: endpoint.port, tlsMode: endpoint.tlsMode };
}

const publicFields = { id: databaseBackups.id, status: databaseBackups.status, restoreStatus: databaseBackups.restoreStatus, checksumSha256: databaseBackups.checksumSha256, sizeBytes: databaseBackups.sizeBytes, failureReason: databaseBackups.failureReason, restoreFailureReason: databaseBackups.restoreFailureReason, startedAt: databaseBackups.startedAt, completedAt: databaseBackups.completedAt, lastRestoreStartedAt: databaseBackups.lastRestoreStartedAt, lastRestoredAt: databaseBackups.lastRestoredAt, expiresAt: databaseBackups.expiresAt, createdAt: databaseBackups.createdAt };

/** Workspace-authorized encrypted logical database backup and restore lifecycle. */
export class DatabaseBackupController {
	public static async index(request: Request, workspacePublicId: number, databaseId: string, metadata: RequestMetadata): Promise<Response> {
		try { const workspace = await workspaceAccess(request, workspacePublicId, metadata); if (!await databaseRecord(workspace.id, databaseId)) return resp.failure('Database not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); const rows = await db.select(publicFields).from(databaseBackups).where(and(eq(databaseBackups.workspaceId, workspace.id), eq(databaseBackups.logicalDatabaseId, databaseId), isNull(databaseBackups.deletedAt))).orderBy(desc(databaseBackups.createdAt)); return resp.success('Database backups retrieved.', rows); }
		catch { return resp.failure('Database not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); }
	}

	public static async create(request: Request, workspacePublicId: number, databaseId: string, metadata: RequestMetadata): Promise<Response> {
		let backupId: string | undefined;
		try {
			const workspace = await workspaceAccess(request, workspacePublicId, metadata); if (!backupsEnabled(workspace.entitlementSnapshot)) return resp.failure('Backups are not enabled for this workspace.', resp.codes.ORDER_CANNOT_BE_PROCESSED, undefined, null, undefined, 422); const record = await databaseRecord(workspace.id, databaseId); if (!record) return resp.failure('Database not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
			const expiresAt = new Date(Date.now() + retentionDays(workspace.entitlementSnapshot) * 86400000); const [backup] = await db.insert(databaseBackups).values({ workspaceId: workspace.id, logicalDatabaseId: databaseId, expiresAt, metadata: { engine: record.cluster.engine } }).returning({ id: databaseBackups.id }); if (!backup) throw new Error('Unable to create backup record.'); backupId = backup.id;
			await db.update(databaseBackups).set({ status: 'running', startedAt: new Date(), updatedAt: new Date() }).where(eq(databaseBackups.id, backup.id)); const stored = await databaseBackupService.create(connection(record), `${workspace.id}/${databaseId}/${backup.id}.qdb`); const completedAt = new Date(); const [completed] = await db.update(databaseBackups).set({ ...stored, status: 'completed', completedAt, updatedAt: completedAt }).where(eq(databaseBackups.id, backup.id)).returning(publicFields); await db.update(logicalDatabases).set({ lastBackedUpAt: completedAt, updatedAt: completedAt }).where(eq(logicalDatabases.id, databaseId)); await recordAuditLog({ actorUserId: workspace.actorUserId, action: 'logical_database.backup_created', resourceType: 'database_backup', resourceId: backup.id, metadata: { workspacePublicId, databaseId, checksumSha256: stored.checksumSha256 }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent }); return resp.success('Database backup completed.', completed, resp.codes.CREATED, undefined, 201);
		} catch (error) { const message = error instanceof Error ? error.message : 'Database backup failed.'; if (backupId) await db.update(databaseBackups).set({ status: 'failed', failureReason: message, updatedAt: new Date() }).where(eq(databaseBackups.id, backupId)).catch(() => undefined); return resp.failure(message, resp.codes.INTERNAL_SERVICE_ERROR, undefined, null, undefined, 500); }
	}

	public static async restore(request: Request, workspacePublicId: number, databaseId: string, backupId: string, input: RestoreDatabaseBackupRequest, metadata: RequestMetadata): Promise<Response> {
		try {
			const workspace = await workspaceAccess(request, workspacePublicId, metadata); const record = await databaseRecord(workspace.id, databaseId); if (!record) return resp.failure('Database not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); if (input.confirmation !== record.database.databaseName) return resp.failure('Confirmation must exactly match the database name.', resp.codes.VALIDATION_ERROR, [{ field: 'confirmation', message: 'Database name does not match.' }], null, undefined, 400); const [backup] = await db.select().from(databaseBackups).where(and(eq(databaseBackups.id, backupId), eq(databaseBackups.workspaceId, workspace.id), eq(databaseBackups.logicalDatabaseId, databaseId), eq(databaseBackups.status, 'completed'), isNull(databaseBackups.deletedAt))).limit(1); if (!backup?.storageKey || !backup.checksumSha256) return resp.failure('Backup not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
			const startedAt = new Date(); await db.update(databaseBackups).set({ restoreStatus: 'running', lastRestoreStartedAt: startedAt, restoreFailureReason: null, updatedAt: startedAt }).where(eq(databaseBackups.id, backup.id)); try { await databaseBackupService.restore(connection(record), backup.storageKey, backup.checksumSha256); } catch (error) { const message = error instanceof Error ? error.message : 'Database restore failed.'; await db.update(databaseBackups).set({ restoreStatus: 'failed', restoreFailureReason: message, updatedAt: new Date() }).where(eq(databaseBackups.id, backup.id)); throw error; } const restoredAt = new Date(); await db.update(databaseBackups).set({ restoreStatus: 'completed', lastRestoredAt: restoredAt, updatedAt: restoredAt }).where(eq(databaseBackups.id, backup.id)); await recordAuditLog({ actorUserId: workspace.actorUserId, action: 'logical_database.backup_restored', resourceType: 'database_backup', resourceId: backup.id, metadata: { workspacePublicId, databaseId }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent }); return resp.success('Database restored from backup.', { id: backup.id, restoredAt }, resp.codes.UPDATED);
		} catch (error) { return resp.failure(error instanceof Error ? error.message : 'Database restore failed.', resp.codes.INTERNAL_SERVICE_ERROR, undefined, null, undefined, 500); }
	}

	public static async download(request: Request, workspacePublicId: number, databaseId: string, backupId: string, metadata: RequestMetadata): Promise<Response> {
		try { const workspace = await workspaceAccess(request, workspacePublicId, metadata); const record = await databaseRecord(workspace.id, databaseId); const [backup] = await db.select().from(databaseBackups).where(and(eq(databaseBackups.id, backupId), eq(databaseBackups.workspaceId, workspace.id), eq(databaseBackups.logicalDatabaseId, databaseId), eq(databaseBackups.status, 'completed'), isNull(databaseBackups.deletedAt))).limit(1); if (!record || !backup?.storageKey || !backup.checksumSha256) return resp.failure('Backup not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); const stream = await databaseBackupService.download(backup.storageKey, backup.checksumSha256); await recordAuditLog({ actorUserId: workspace.actorUserId, action: 'logical_database.backup_downloaded', resourceType: 'database_backup', resourceId: backup.id, metadata: { workspacePublicId, databaseId }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent }); return new Response(Readable.toWeb(stream) as ReadableStream, { headers: { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${record.database.databaseName}-${backup.id}.${record.cluster.engine === 'postgresql' ? 'dump' : 'sql'}"`, 'cache-control': 'no-store' } }); }
		catch (error) { return resp.failure(error instanceof Error ? error.message : 'Backup download failed.', resp.codes.INTERNAL_SERVICE_ERROR, undefined, null, undefined, 500); }
	}

	public static async delete(request: Request, workspacePublicId: number, databaseId: string, backupId: string, input: DestructiveActionRequest, metadata: RequestMetadata): Promise<Response> {
		try { const workspace = await workspaceAccess(request, workspacePublicId, metadata); const [backup] = await db.select().from(databaseBackups).where(and(eq(databaseBackups.id, backupId), eq(databaseBackups.workspaceId, workspace.id), eq(databaseBackups.logicalDatabaseId, databaseId), isNull(databaseBackups.deletedAt))).limit(1); if (!backup) return resp.failure('Backup not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); const confirmationName = `backup-${backup.id.slice(0, 8)}`; if (input.confirmationName !== confirmationName || input.connectedResourceNames.length) { await recordAuditLog({ actorUserId: workspace.actorUserId, action: 'logical_database.backup_delete_rejected', resourceType: 'database_backup', resourceId: backup.id, metadata: { workspacePublicId, databaseId, reason: 'Confirmation mismatch.' }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent }); return resp.failure('Backup deletion confirmation does not match.', resp.codes.ORDER_CANNOT_BE_PROCESSED, undefined, null, undefined, 422); } if (backup.storageKey) await databaseBackupService.delete(backup.storageKey); const deletedAt = new Date(); await db.update(databaseBackups).set({ status: 'deleted', deletedAt, deleteReason: 'Deleted by workspace user.', updatedAt: deletedAt }).where(eq(databaseBackups.id, backup.id)); await recordAuditLog({ actorUserId: workspace.actorUserId, action: 'logical_database.backup_deleted', resourceType: 'database_backup', resourceId: backup.id, metadata: { workspacePublicId, databaseId }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent }); return resp.success('Database backup deleted.', { id: backup.id }, resp.codes.UPDATED); }
		catch (error) { return resp.failure(error instanceof Error ? error.message : 'Backup deletion failed.', resp.codes.INTERNAL_SERVICE_ERROR, undefined, null, undefined, 500); }
	}
}

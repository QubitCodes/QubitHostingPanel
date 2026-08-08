import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, isNull, lte } from 'drizzle-orm';

import { createBackup } from '@controllers/DatabaseBackupController';
import { db } from '@db/client';
import { databaseClusters, databaseTransferJobs, logicalDatabases } from '@db/schema';
import type { DatabaseImportRequest, DatabaseTransferExportRequest } from '@schemas/databaseTransfer';
import { recordAuditLog } from '@services/auditLogService';
import { databaseClusterEndpoint } from '@services/databases/databaseClusterEndpointService';
import { databaseTransferArtifactService } from '@services/databases/databaseTransferArtifactService';
import { DatabaseTransferService, type UploadContext } from '@services/databases/databaseTransferService';
import type { DatabaseBackupConnection } from '@services/databases/databaseBackupService';
import { decryptCredential, encryptCredential } from '@services/encryption/credentialEncryptionService';
import { getEnvironment } from '@config/env';

const transfers = new DatabaseTransferService();

async function connectionFor(databaseId: string, workspaceId: string): Promise<DatabaseBackupConnection> {
	const [record] = await db.select({ database: logicalDatabases, cluster: databaseClusters }).from(logicalDatabases).innerJoin(databaseClusters, eq(databaseClusters.id, logicalDatabases.clusterId)).where(and(eq(logicalDatabases.id, databaseId), eq(logicalDatabases.workspaceId, workspaceId), eq(logicalDatabases.status, 'active'), isNull(logicalDatabases.deletedAt), isNull(databaseClusters.deletedAt))).limit(1);
	if (!record) throw new Error('Database not found.');
	const credential = JSON.parse(decryptCredential(record.database.credentialCiphertext)) as { password?: unknown }; const endpoint = databaseClusterEndpoint(record.cluster);
	if (typeof credential.password !== 'string' || !credential.password) throw new Error('Database credential is unavailable.');
	return { databaseName: record.database.databaseName, engine: record.cluster.engine, host: endpoint.host, password: credential.password, port: endpoint.port, tlsMode: endpoint.tlsMode, username: record.database.username };
}

async function streamBytes(stream: NodeJS.ReadableStream): Promise<Buffer> {
	const chunks: Buffer[] = []; let size = 0; const maximum = getEnvironment().DATABASE_IMPORT_MAX_MB * 1048576;
	for await (const chunk of stream) { const bytes = Buffer.isBuffer(chunk) ? chunk : typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk as Uint8Array); size += bytes.length; if (size > maximum) throw new Error(`Transfer output exceeds ${getEnvironment().DATABASE_IMPORT_MAX_MB} MB.`); chunks.push(bytes); }
	return Buffer.concat(chunks);
}

export function publicTransferJob(record: typeof databaseTransferJobs.$inferSelect) {
	return { id: record.id, direction: record.direction, format: record.format, scope: record.scope, status: record.status, mode: record.mode, schema: record.schemaName, table: record.tableName, outputName: record.outputName, outputSizeBytes: record.outputSizeBytes, progressPercent: record.progressPercent, processedRows: record.processedRows, totalRows: record.totalRows, attemptCount: record.attemptCount, maximumAttempts: record.maximumAttempts, preImportBackupId: record.preImportBackupId, failureReason: record.failureReason, startedAt: record.startedAt, completedAt: record.completedAt, expiresAt: record.expiresAt, createdAt: record.createdAt, updatedAt: record.updatedAt };
}

export async function enqueueDatabaseImport(input: DatabaseImportRequest, context: UploadContext): Promise<typeof databaseTransferJobs.$inferSelect> {
	const upload = transfers.inspect(input.uploadToken, context); const tabular = upload.format === 'csv' || upload.format === 'json';
	if (tabular && (!input.schema || !input.table)) throw new Error('Schema and table are required for CSV and JSON imports.');
	if (!tabular && (input.schema || input.table)) throw new Error('Native database imports do not accept a table target.');
	const format: 'csv' | 'json' | 'native' = upload.format === 'csv' || upload.format === 'json' ? upload.format : 'native';
	const [job] = await db.insert(databaseTransferJobs).values({ workspaceId: context.workspaceId, logicalDatabaseId: context.databaseId, requestedByUserId: context.actorUserId, direction: 'import', format, scope: tabular ? 'table' : 'database', mode: input.mode, schemaName: input.schema, tableName: input.table, sourceCiphertext: encryptCredential(JSON.stringify(input)), metadata: { sourceName: upload.name, sourceSize: upload.size, sourceFormat: upload.format } }).returning();
	return job;
}

export async function enqueueDatabaseExport(input: DatabaseTransferExportRequest, context: UploadContext): Promise<typeof databaseTransferJobs.$inferSelect> {
	const [job] = await db.insert(databaseTransferJobs).values({ workspaceId: context.workspaceId, logicalDatabaseId: context.databaseId, requestedByUserId: context.actorUserId, direction: 'export', format: input.format, scope: input.scope, schemaName: input.schema, tableName: input.table, metadata: {} }).returning();
	return job;
}

async function cancelled(jobId: string): Promise<boolean> {
	const [record] = await db.select({ status: databaseTransferJobs.status }).from(databaseTransferJobs).where(eq(databaseTransferJobs.id, jobId)).limit(1);
	return record?.status === 'cancel_requested';
}

async function executeJob(job: typeof databaseTransferJobs.$inferSelect): Promise<void> {
	const connection = await connectionFor(job.logicalDatabaseId, job.workspaceId);
	const hooks = {
		shouldCancel: () => cancelled(job.id),
		onProgress: async (processedRows: number, totalRows: number) => { const progressPercent = Math.min(90, 30 + Math.round((processedRows / Math.max(1, totalRows)) * 60)); await db.update(databaseTransferJobs).set({ processedRows, totalRows, progressPercent, updatedAt: new Date() }).where(eq(databaseTransferJobs.id, job.id)); },
	};
	if (job.direction === 'import') {
		await db.update(databaseTransferJobs).set({ progressPercent: 5, updatedAt: new Date() }).where(eq(databaseTransferJobs.id, job.id));
		const safetyBackup = await createBackup(job.workspaceId, job.logicalDatabaseId, 7, 'manual');
		if (!safetyBackup?.id) throw new Error('Pre-import safety backup failed. Import was not started.');
		await db.update(databaseTransferJobs).set({ preImportBackupId: safetyBackup.id, progressPercent: 25, updatedAt: new Date() }).where(eq(databaseTransferJobs.id, job.id));
		if (!job.sourceCiphertext) throw new Error('Import source is unavailable.');
		const input = JSON.parse(decryptCredential(job.sourceCiphertext)) as DatabaseImportRequest;
		const result = await transfers.import(connection, input, { actorUserId: job.requestedByUserId, databaseId: job.logicalDatabaseId, workspaceId: job.workspaceId }, hooks);
		await db.update(databaseTransferJobs).set({ processedRows: result.rows ?? 0, totalRows: result.rows ?? null, progressPercent: 100, status: 'completed', completedAt: new Date(), updatedAt: new Date() }).where(eq(databaseTransferJobs.id, job.id));
		await recordAuditLog({ actorUserId: job.requestedByUserId, action: 'logical_database.transfer_import_completed', resourceType: 'database_transfer_job', resourceId: job.id, metadata: { databaseId: job.logicalDatabaseId, workspaceId: job.workspaceId, format: job.format, scope: job.scope, preImportBackupId: safetyBackup.id, rows: result.rows ?? null } });
		return;
	}
	if (await cancelled(job.id)) throw new Error('Transfer cancelled.');
	let bytes: Buffer; let filename: string; let rows = 0;
	if (job.scope === 'database') { const result = transfers.export(connection); bytes = await streamBytes(result.stream); filename = result.filename; }
	else { if (!job.schemaName || !job.tableName || job.format === 'native') throw new Error('Table export configuration is invalid.'); const result = await transfers.exportTable(connection, job.schemaName, job.tableName, job.format, hooks); bytes = result.bytes; filename = result.filename; rows = result.rows; }
	if (await cancelled(job.id)) throw new Error('Transfer cancelled.');
	const storageKey = `${randomUUID()}.qdt`; const stored = await databaseTransferArtifactService.create(storageKey, bytes); const expiresAt = new Date(Date.now() + getEnvironment().DATABASE_TRANSFER_RETENTION_HOURS * 3600000);
	await db.update(databaseTransferJobs).set({ outputStorageKey: storageKey, outputName: filename, outputChecksumSha256: stored.checksumSha256, outputSizeBytes: stored.sizeBytes, processedRows: rows, totalRows: rows || null, progressPercent: 100, status: 'completed', completedAt: new Date(), expiresAt, updatedAt: new Date() }).where(eq(databaseTransferJobs.id, job.id));
	await recordAuditLog({ actorUserId: job.requestedByUserId, action: 'logical_database.transfer_export_completed', resourceType: 'database_transfer_job', resourceId: job.id, metadata: { databaseId: job.logicalDatabaseId, workspaceId: job.workspaceId, format: job.format, scope: job.scope, rows, sizeBytes: stored.sizeBytes } });
}

/** Claims and processes durable transfer jobs, then expires old artifacts. */
export async function processDatabaseTransferJobs(limit = 3): Promise<{ cancelled: number; cleaned: number; failed: number; processed: number; succeeded: number }> {
	let processed = 0; let succeeded = 0; let failed = 0; let cancelledCount = 0;
	for (let index = 0; index < limit; index += 1) {
		const [candidate] = await db.select().from(databaseTransferJobs).where(and(eq(databaseTransferJobs.status, 'queued'), isNull(databaseTransferJobs.deletedAt))).orderBy(asc(databaseTransferJobs.createdAt)).limit(1);
		if (!candidate) break;
		const [job] = await db.update(databaseTransferJobs).set({ status: 'running', startedAt: new Date(), progressPercent: 1, attemptCount: candidate.attemptCount + 1, failureReason: null, updatedAt: new Date() }).where(and(eq(databaseTransferJobs.id, candidate.id), eq(databaseTransferJobs.status, 'queued'))).returning();
		if (!job) continue; processed += 1;
		try { await executeJob(job); succeeded += 1; }
		catch (error) { const reason = error instanceof Error ? error.message : 'Database transfer failed.'; const wasCancelled = reason === 'Transfer cancelled.' || await cancelled(job.id); await db.update(databaseTransferJobs).set({ status: wasCancelled ? 'cancelled' : 'failed', failureReason: reason, completedAt: new Date(), updatedAt: new Date() }).where(eq(databaseTransferJobs.id, job.id)); await recordAuditLog({ actorUserId: job.requestedByUserId, action: wasCancelled ? 'logical_database.transfer_cancelled' : 'logical_database.transfer_failed', resourceType: 'database_transfer_job', resourceId: job.id, metadata: { databaseId: job.logicalDatabaseId, workspaceId: job.workspaceId, attemptCount: job.attemptCount, reason } }).catch(() => undefined); if (wasCancelled) cancelledCount += 1; else failed += 1; }
	}
	const expired = await db.select().from(databaseTransferJobs).where(and(eq(databaseTransferJobs.status, 'completed'), lte(databaseTransferJobs.expiresAt, new Date()), isNull(databaseTransferJobs.deletedAt))).limit(25); let cleaned = 0;
	for (const job of expired) { if (!job.outputStorageKey) continue; try { await databaseTransferArtifactService.delete(job.outputStorageKey); await db.update(databaseTransferJobs).set({ outputStorageKey: null, outputChecksumSha256: null, deleteReason: 'Transfer artifact expired.', updatedAt: new Date() }).where(eq(databaseTransferJobs.id, job.id)); cleaned += 1; } catch { /* Retry cleanup on the next worker pass. */ } }
	return { cancelled: cancelledCount, cleaned, failed, processed, succeeded };
}

export async function requestTransferAction(jobId: string, workspaceId: string, databaseId: string, actorUserId: string, action: 'cancel' | 'retry'): Promise<typeof databaseTransferJobs.$inferSelect | undefined> {
	const now = new Date();
	if (action === 'cancel') { const [updated] = await db.update(databaseTransferJobs).set({ status: 'cancel_requested', updatedAt: now }).where(and(eq(databaseTransferJobs.id, jobId), eq(databaseTransferJobs.workspaceId, workspaceId), eq(databaseTransferJobs.logicalDatabaseId, databaseId), eq(databaseTransferJobs.requestedByUserId, actorUserId), inArray(databaseTransferJobs.status, ['queued', 'running']))).returning(); return updated; }
	const [record] = await db.select().from(databaseTransferJobs).where(and(eq(databaseTransferJobs.id, jobId), eq(databaseTransferJobs.workspaceId, workspaceId), eq(databaseTransferJobs.logicalDatabaseId, databaseId), eq(databaseTransferJobs.requestedByUserId, actorUserId), inArray(databaseTransferJobs.status, ['failed', 'cancelled']), isNull(databaseTransferJobs.deletedAt))).limit(1);
	if (!record || record.attemptCount >= record.maximumAttempts || (record.direction === 'import' && !record.sourceCiphertext)) return undefined;
	const [updated] = await db.update(databaseTransferJobs).set({ status: 'queued', progressPercent: 0, processedRows: 0, totalRows: null, failureReason: null, startedAt: null, completedAt: null, updatedAt: now }).where(eq(databaseTransferJobs.id, record.id)).returning(); return updated;
}

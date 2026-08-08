import { and, asc, eq, inArray, isNull, lte } from 'drizzle-orm';

import { createBackup } from '@controllers/DatabaseBackupController';
import { db } from '@db/client';
import { databaseBackups, databaseBackupSchedules } from '@db/schema';
import { recordAuditLog } from '@services/auditLogService';
import { databaseBackupService } from '@services/databases/databaseBackupService';

/** Runs due logical-database backups and removes expired artifacts in bounded batches. */
export async function processDatabaseBackupAutomation(limit = 5): Promise<{ cleaned: number; failed: number; processed: number; succeeded: number }> {
	const now = new Date();
	const due = await db.select().from(databaseBackupSchedules).where(and(eq(databaseBackupSchedules.isEnabled, true), lte(databaseBackupSchedules.nextRunAt, now), isNull(databaseBackupSchedules.deletedAt))).orderBy(asc(databaseBackupSchedules.nextRunAt)).limit(limit);
	let failed = 0; let succeeded = 0;
	for (const schedule of due) {
		try {
			const backup = await createBackup(schedule.workspaceId, schedule.logicalDatabaseId, schedule.retentionDays, 'scheduled');
			const completedAt = new Date(); await db.update(databaseBackupSchedules).set({ lastRunAt: completedAt, lastRunStatus: 'completed', lastFailureReason: null, nextRunAt: new Date(completedAt.getTime() + schedule.frequencyHours * 3600000), updatedAt: completedAt }).where(eq(databaseBackupSchedules.id, schedule.id));
			await recordAuditLog({ action: 'logical_database.backup_scheduled', resourceType: 'database_backup', resourceId: backup?.id, metadata: { automated: true, scheduleId: schedule.id, workspaceId: schedule.workspaceId, logicalDatabaseId: schedule.logicalDatabaseId } }); succeeded += 1;
		} catch (error) {
			const failedAt = new Date(); const reason = error instanceof Error ? error.message : 'Scheduled backup failed.'; await db.update(databaseBackupSchedules).set({ lastRunAt: failedAt, lastRunStatus: 'failed', lastFailureReason: reason, nextRunAt: new Date(failedAt.getTime() + schedule.frequencyHours * 3600000), updatedAt: failedAt }).where(eq(databaseBackupSchedules.id, schedule.id));
			await recordAuditLog({ action: 'logical_database.backup_schedule_failed', resourceType: 'database_backup_schedule', resourceId: schedule.id, metadata: { automated: true, reason, workspaceId: schedule.workspaceId, logicalDatabaseId: schedule.logicalDatabaseId } }).catch(() => undefined); failed += 1;
		}
	}
	const expired = await db.select().from(databaseBackups).where(and(inArray(databaseBackups.status, ['completed', 'failed']), lte(databaseBackups.expiresAt, now), isNull(databaseBackups.deletedAt))).orderBy(asc(databaseBackups.expiresAt)).limit(Math.max(10, limit * 4));
	let cleaned = 0;
	for (const backup of expired) {
		try { if (backup.storageKey) await databaseBackupService.delete(backup.storageKey, backup.storageProvider); const deletedAt = new Date(); await db.update(databaseBackups).set({ status: 'deleted', deletedAt, deleteReason: 'Expired by retention policy.', updatedAt: deletedAt }).where(eq(databaseBackups.id, backup.id)); await recordAuditLog({ action: 'logical_database.backup_expired', resourceType: 'database_backup', resourceId: backup.id, metadata: { automated: true, logicalDatabaseId: backup.logicalDatabaseId, workspaceId: backup.workspaceId } }); cleaned += 1; } catch { /* Retry safely on the next worker run. */ }
	}
	return { cleaned, failed, processed: due.length, succeeded };
}

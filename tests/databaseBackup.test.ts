import { afterEach, describe, expect, it } from 'vitest';

import { resetEnvironmentForTests } from '@config/env';
import { cloneDatabaseBackupSchema, databaseBackupPublicIdSchema, databaseBackupScheduleSchema, restoreDatabaseBackupSchema } from '@schemas/databaseBackup';
import { databaseDumpCommand, resolveDatabaseBackupPath } from '@services/databases/databaseBackupService';

afterEach(() => resetEnvironmentForTests());

describe('database backup safety', () => {
	it('accepts exact restore confirmation payloads and UUID backup IDs', () => {
		expect(restoreDatabaseBackupSchema.parse({ confirmation: 'q_100001_main' })).toEqual({ confirmation: 'q_100001_main' });
		expect(databaseBackupPublicIdSchema.safeParse('backup-one').success).toBe(false);
	});

	it('keeps generated storage keys under the configured root', () => {
		expect(resolveDatabaseBackupPath('storage/database-backups', 'workspace/database/backup.qdb')).toMatch(/storage[\\/]database-backups[\\/]workspace/);
		expect(() => resolveDatabaseBackupPath('storage/database-backups', '../credential.qdb')).toThrow('invalid');
	});

	it('validates bounded schedules and exact clone targets', () => {
		expect(databaseBackupScheduleSchema.parse({ frequencyHours: 24, isEnabled: true, retentionDays: 14 })).toEqual({ frequencyHours: 24, isEnabled: true, retentionDays: 14 });
		expect(databaseBackupScheduleSchema.safeParse({ frequencyHours: 0, isEnabled: true, retentionDays: 14 }).success).toBe(false);
		expect(cloneDatabaseBackupSchema.safeParse({ targetDatabaseId: 'not-a-uuid', confirmation: 'target' }).success).toBe(false);
	});

	it('keeps PostgreSQL passwords out of native command arguments', () => {
		process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/panel';
		const command = databaseDumpCommand({ databaseName: 'workspace_db', engine: 'postgresql', host: '127.0.0.1', password: 'top-secret', port: 5432, tlsMode: 'disabled', username: 'workspace_user' });
		expect(command.args).not.toContain('top-secret');
		expect(command.environment.PGPASSWORD).toBe('top-secret');
	});
});

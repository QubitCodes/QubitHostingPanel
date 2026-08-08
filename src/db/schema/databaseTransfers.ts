import { relations, sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

import { users } from './identity';
import { databaseBackups, logicalDatabases } from './sharedPlatform';
import { workspaces } from './tenancy';

export const databaseTransferDirectionEnum = pgEnum('database_transfer_direction', ['import', 'export']);
export const databaseTransferFormatEnum = pgEnum('database_transfer_format', ['native', 'csv', 'json']);
export const databaseTransferScopeEnum = pgEnum('database_transfer_scope', ['database', 'table']);
export const databaseTransferStatusEnum = pgEnum('database_transfer_status', ['queued', 'running', 'cancel_requested', 'cancelled', 'completed', 'failed']);

/** Durable import/export job with bounded progress and recovery evidence. */
export const databaseTransferJobs = pgTable('database_transfer_jobs', {
	id: uuid('id').primaryKey().defaultRandom(),
	workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
	logicalDatabaseId: uuid('logical_database_id').notNull().references(() => logicalDatabases.id, { onDelete: 'restrict' }),
	requestedByUserId: uuid('requested_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
	direction: databaseTransferDirectionEnum('direction').notNull(),
	format: databaseTransferFormatEnum('format').notNull(),
	scope: databaseTransferScopeEnum('scope').notNull(),
	status: databaseTransferStatusEnum('status').notNull().default('queued'),
	mode: varchar('mode', { length: 20 }),
	schemaName: varchar('schema_name', { length: 128 }),
	tableName: varchar('table_name', { length: 128 }),
	sourceCiphertext: text('source_ciphertext'),
	outputStorageKey: varchar('output_storage_key', { length: 500 }),
	outputName: varchar('output_name', { length: 255 }),
	outputChecksumSha256: varchar('output_checksum_sha256', { length: 64 }),
	outputSizeBytes: integer('output_size_bytes'),
	progressPercent: integer('progress_percent').notNull().default(0),
	processedRows: integer('processed_rows').notNull().default(0),
	totalRows: integer('total_rows'),
	attemptCount: integer('attempt_count').notNull().default(0),
	maximumAttempts: integer('maximum_attempts').notNull().default(3),
	preImportBackupId: uuid('pre_import_backup_id').references(() => databaseBackups.id, { onDelete: 'restrict' }),
	failureReason: text('failure_reason'),
	metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
	startedAt: timestamp('started_at', { withTimezone: true }),
	completedAt: timestamp('completed_at', { withTimezone: true }),
	expiresAt: timestamp('expires_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 }),
}, (table) => [
	index('database_transfer_jobs_database_created_idx').on(table.logicalDatabaseId, table.createdAt),
	index('database_transfer_jobs_status_created_idx').on(table.status, table.createdAt),
	index('database_transfer_jobs_expiry_idx').on(table.expiresAt),
	uniqueIndex('database_transfer_jobs_active_database_unique').on(table.logicalDatabaseId).where(sql`${table.status} IN ('queued', 'running', 'cancel_requested') AND ${table.deletedAt} IS NULL`),
	check('database_transfer_jobs_progress_check', sql`${table.progressPercent} BETWEEN 0 AND 100`),
	check('database_transfer_jobs_rows_check', sql`${table.processedRows} >= 0 AND (${table.totalRows} IS NULL OR ${table.totalRows} >= 0)`),
	check('database_transfer_jobs_attempts_check', sql`${table.attemptCount} >= 0 AND ${table.maximumAttempts} BETWEEN 1 AND 10`),
]);

export const databaseTransferJobRelations = relations(databaseTransferJobs, ({ one }) => ({
	database: one(logicalDatabases, { fields: [databaseTransferJobs.logicalDatabaseId], references: [logicalDatabases.id] }),
	preImportBackup: one(databaseBackups, { fields: [databaseTransferJobs.preImportBackupId], references: [databaseBackups.id] }),
	requestedBy: one(users, { fields: [databaseTransferJobs.requestedByUserId], references: [users.id] }),
	workspace: one(workspaces, { fields: [databaseTransferJobs.workspaceId], references: [workspaces.id] }),
}));

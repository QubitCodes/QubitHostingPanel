import { relations, sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

import { applicationBuilds } from './sharedPlatform';
import { workspaces } from './tenancy';

export const applicationCronSyncStatusEnum = pgEnum('application_cron_sync_status', ['pending', 'synchronized', 'failed']);

/** Customer-defined scheduled command synchronized to the application's hosting provider. */
export const applicationCronJobs = pgTable('application_cron_jobs', {
	id: uuid('id').primaryKey().defaultRandom(),
	workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
	applicationBuildId: uuid('application_build_id').notNull().references(() => applicationBuilds.id, { onDelete: 'restrict' }),
	name: varchar('name', { length: 120 }).notNull(),
	command: text('command').notNull(),
	frequency: varchar('frequency', { length: 100 }).notNull(),
	timeoutSeconds: integer('timeout_seconds').notNull().default(300),
	isEnabled: boolean('is_enabled').notNull().default(true),
	providerTaskUuid: varchar('provider_task_uuid', { length: 255 }),
	syncStatus: applicationCronSyncStatusEnum('sync_status').notNull().default('pending'),
	lastSynchronizedAt: timestamp('last_synchronized_at', { withTimezone: true }),
	lastSyncError: text('last_sync_error'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 }),
}, (table) => [
	uniqueIndex('application_cron_jobs_name_active_unique').on(table.applicationBuildId, table.name).where(sql`${table.deletedAt} IS NULL`),
	uniqueIndex('application_cron_jobs_provider_uuid_active_unique').on(table.providerTaskUuid).where(sql`${table.providerTaskUuid} IS NOT NULL AND ${table.deletedAt} IS NULL`),
	index('application_cron_jobs_application_enabled_idx').on(table.applicationBuildId, table.isEnabled),
	check('application_cron_jobs_timeout_check', sql`${table.timeoutSeconds} BETWEEN 1 AND 3600`),
]);

export const applicationCronJobRelations = relations(applicationCronJobs, ({ one }) => ({
	workspace: one(workspaces, { fields: [applicationCronJobs.workspaceId], references: [workspaces.id] }),
	application: one(applicationBuilds, { fields: [applicationCronJobs.applicationBuildId], references: [applicationBuilds.id] }),
}));

export type ApplicationCronJob = typeof applicationCronJobs.$inferSelect;

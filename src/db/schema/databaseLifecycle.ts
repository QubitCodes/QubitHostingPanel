import { relations, sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

import { users } from './identity';
import { logicalDatabases } from './sharedPlatform';
import { workspaces } from './tenancy';

export const databaseExternalAccessStatusEnum = pgEnum('database_external_access_status', ['pending', 'active', 'failed', 'revoked']);

/** Package-gated public gateway policy for one logical database. Cluster management endpoints remain private. */
export const databaseExternalAccessRules = pgTable('database_external_access_rules', {
	id: uuid('id').primaryKey().defaultRandom(),
	workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
	logicalDatabaseId: uuid('logical_database_id').notNull().references(() => logicalDatabases.id, { onDelete: 'restrict' }),
	createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
	status: databaseExternalAccessStatusEnum('status').notNull().default('pending'),
	gatewayPort: integer('gateway_port').notNull(),
	allowedCidrs: jsonb('allowed_cidrs').$type<string[]>().notNull().default([]),
	expiresAt: timestamp('expires_at', { withTimezone: true }),
	failureReason: text('failure_reason'),
	lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
	revision: varchar('revision', { length: 64 }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 }),
}, (table) => [
	uniqueIndex('database_external_access_database_active_unique').on(table.logicalDatabaseId).where(sql`${table.deletedAt} IS NULL AND ${table.status} <> 'revoked'`),
	uniqueIndex('database_external_access_gateway_port_active_unique').on(table.gatewayPort).where(sql`${table.deletedAt} IS NULL AND ${table.status} <> 'revoked'`),
	index('database_external_access_workspace_status_idx').on(table.workspaceId, table.status),
	index('database_external_access_expiry_idx').on(table.expiresAt),
	check('database_external_access_gateway_port_check', sql`${table.gatewayPort} BETWEEN 20000 AND 29999`),
	check('database_external_access_cidrs_check', sql`jsonb_array_length(${table.allowedCidrs}) BETWEEN 1 AND 32`),
]);

export const databaseExternalAccessRuleRelations = relations(databaseExternalAccessRules, ({ one }) => ({
	createdBy: one(users, { fields: [databaseExternalAccessRules.createdByUserId], references: [users.id] }),
	database: one(logicalDatabases, { fields: [databaseExternalAccessRules.logicalDatabaseId], references: [logicalDatabases.id] }),
	workspace: one(workspaces, { fields: [databaseExternalAccessRules.workspaceId], references: [workspaces.id] }),
}));

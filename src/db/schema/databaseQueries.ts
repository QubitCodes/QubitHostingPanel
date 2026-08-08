import { relations, sql } from 'drizzle-orm';
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

import { users } from './identity';
import { logicalDatabases } from './sharedPlatform';
import { workspaces } from './tenancy';

/** Encrypted, reusable SQL owned by one authenticated workspace member. */
export const databaseSavedQueries = pgTable('database_saved_queries', {
	id: uuid('id').primaryKey().defaultRandom(),
	workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
	logicalDatabaseId: uuid('logical_database_id').notNull().references(() => logicalDatabases.id, { onDelete: 'restrict' }),
	ownerUserId: uuid('owner_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
	name: varchar('name', { length: 120 }).notNull(),
	description: varchar('description', { length: 500 }),
	queryCiphertext: text('query_ciphertext').notNull(),
	allowChanges: boolean('allow_changes').notNull().default(false),
	rowLimit: integer('row_limit').notNull().default(100),
	isFavorite: boolean('is_favorite').notNull().default(false),
	executionCount: integer('execution_count').notNull().default(0),
	lastExecutedAt: timestamp('last_executed_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 }),
}, (table) => [
	uniqueIndex('database_saved_queries_owner_name_active_unique').on(table.logicalDatabaseId, table.ownerUserId, table.name).where(sql`${table.deletedAt} IS NULL`),
	index('database_saved_queries_owner_database_favorite_idx').on(table.ownerUserId, table.logicalDatabaseId, table.isFavorite),
	index('database_saved_queries_workspace_database_idx').on(table.workspaceId, table.logicalDatabaseId),
]);

export const databaseSavedQueryRelations = relations(databaseSavedQueries, ({ one }) => ({
	database: one(logicalDatabases, { fields: [databaseSavedQueries.logicalDatabaseId], references: [logicalDatabases.id] }),
	owner: one(users, { fields: [databaseSavedQueries.ownerUserId], references: [users.id] }),
	workspace: one(workspaces, { fields: [databaseSavedQueries.workspaceId], references: [workspaces.id] }),
}));

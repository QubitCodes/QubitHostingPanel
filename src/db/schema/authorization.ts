import { relations, sql } from 'drizzle-orm';
import {
	boolean,
	index,
	pgEnum,
	pgTable,
	primaryKey,
	timestamp,
	uniqueIndex,
	uuid,
	varchar
} from 'drizzle-orm/pg-core';

import { users } from '@db/schema/identity';

export const permissionOverrideEffectEnum = pgEnum('permission_override_effect', ['allow', 'deny']);

export const platformRoles = pgTable('platform_roles', {
	id: uuid('id').primaryKey().defaultRandom(),
	code: varchar('code', { length: 80 }).notNull(),
	name: varchar('name', { length: 120 }).notNull(),
	description: varchar('description', { length: 500 }),
	isSystem: boolean('is_system').notNull().default(false),
	isSuperAdmin: boolean('is_super_admin').notNull().default(false),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 })
}, (table) => [
	uniqueIndex('platform_roles_code_unique').on(table.code).where(sql`${table.deletedAt} IS NULL`)
]);

export const platformPermissions = pgTable('platform_permissions', {
	id: uuid('id').primaryKey().defaultRandom(),
	code: varchar('code', { length: 120 }).notNull(),
	name: varchar('name', { length: 160 }).notNull(),
	description: varchar('description', { length: 500 }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 })
}, (table) => [
	uniqueIndex('platform_permissions_code_unique').on(table.code).where(sql`${table.deletedAt} IS NULL`)
]);

export const platformRolePermissions = pgTable('platform_role_permissions', {
	roleId: uuid('role_id').notNull().references(() => platformRoles.id, { onDelete: 'cascade' }),
	permissionId: uuid('permission_id').notNull().references(() => platformPermissions.id, { onDelete: 'cascade' }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 })
}, (table) => [
	primaryKey({ columns: [table.roleId, table.permissionId], name: 'platform_role_permissions_pk' }),
	index('platform_role_permissions_permission_idx').on(table.permissionId)
]);

export const platformUserRoles = pgTable('platform_user_roles', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	roleId: uuid('role_id').notNull().references(() => platformRoles.id, { onDelete: 'cascade' }),
	assignedByUserId: uuid('assigned_by_user_id').references(() => users.id, { onDelete: 'set null' }),
	assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
	expiresAt: timestamp('expires_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 })
}, (table) => [
	index('platform_user_roles_user_idx').on(table.userId),
	uniqueIndex('platform_user_roles_active_unique').on(table.userId, table.roleId).where(sql`${table.deletedAt} IS NULL`)
]);

export const platformUserPermissionOverrides = pgTable('platform_user_permission_overrides', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	permissionId: uuid('permission_id').notNull().references(() => platformPermissions.id, { onDelete: 'cascade' }),
	effect: permissionOverrideEffectEnum('effect').notNull(),
	reason: varchar('reason', { length: 500 }).notNull(),
	assignedByUserId: uuid('assigned_by_user_id').references(() => users.id, { onDelete: 'set null' }),
	expiresAt: timestamp('expires_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 })
}, (table) => [
	index('platform_user_permission_overrides_user_idx').on(table.userId),
	uniqueIndex('platform_user_permission_overrides_active_unique')
		.on(table.userId, table.permissionId)
		.where(sql`${table.deletedAt} IS NULL`)
]);

export const platformRolesRelations = relations(platformRoles, ({ many }) => ({
	permissions: many(platformRolePermissions),
	userAssignments: many(platformUserRoles)
}));

export const platformPermissionsRelations = relations(platformPermissions, ({ many }) => ({
	overrides: many(platformUserPermissionOverrides),
	roles: many(platformRolePermissions)
}));

export const platformRolePermissionsRelations = relations(platformRolePermissions, ({ one }) => ({
	permission: one(platformPermissions, { fields: [platformRolePermissions.permissionId], references: [platformPermissions.id] }),
	role: one(platformRoles, { fields: [platformRolePermissions.roleId], references: [platformRoles.id] })
}));

export const platformUserRolesRelations = relations(platformUserRoles, ({ one }) => ({
	assignedBy: one(users, { fields: [platformUserRoles.assignedByUserId], references: [users.id], relationName: 'platformRoleAssigner' }),
	role: one(platformRoles, { fields: [platformUserRoles.roleId], references: [platformRoles.id] }),
	user: one(users, { fields: [platformUserRoles.userId], references: [users.id], relationName: 'platformRoleUser' })
}));

export const platformUserPermissionOverridesRelations = relations(platformUserPermissionOverrides, ({ one }) => ({
	assignedBy: one(users, { fields: [platformUserPermissionOverrides.assignedByUserId], references: [users.id], relationName: 'permissionOverrideAssigner' }),
	permission: one(platformPermissions, { fields: [platformUserPermissionOverrides.permissionId], references: [platformPermissions.id] }),
	user: one(users, { fields: [platformUserPermissionOverrides.userId], references: [users.id], relationName: 'permissionOverrideUser' })
}));

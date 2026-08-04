import { relations, sql } from 'drizzle-orm';
import {
	check,
	index,
	integer,
	pgEnum,
	pgSequence,
	pgTable,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
	text,
} from 'drizzle-orm/pg-core';

import { users } from './identity';

export const customerOnboardingStatusEnum = pgEnum('customer_onboarding_status', [
	'pending',
	'complete',
]);
export const workspaceTypeEnum = pgEnum('workspace_type', [
	'personal',
	'organisation',
]);
export const workspaceStatusEnum = pgEnum('workspace_status', [
	'active',
	'suspended',
	'archived',
]);
export const workspaceMembershipRoleEnum = pgEnum('workspace_membership_role', [
	'owner',
	'administrator',
	'billing_manager',
	'member',
]);
export const workspaceMembershipStatusEnum = pgEnum('workspace_membership_status', [
	'invited',
	'active',
	'suspended',
	'left',
]);
export const workspaceOwnershipTransferStatusEnum = pgEnum('workspace_ownership_transfer_status', ['pending', 'accepted', 'declined', 'cancelled', 'expired']);

export const customerPublicIdSequence = pgSequence('customer_public_id_seq', {
	startWith: 100000,
	minValue: 100000,
	maxValue: 999999,
	cycle: false,
});
export const workspacePublicIdSequence = pgSequence('workspace_public_id_seq', {
	startWith: 100000,
	minValue: 100000,
	maxValue: 999999,
	cycle: false,
});

export const customers = pgTable('customers', {
	id: uuid('id').primaryKey().defaultRandom(),
	publicId: integer('public_id').notNull().default(sql`nextval('customer_public_id_seq')`),
	userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
	onboardingStatus: customerOnboardingStatusEnum('onboarding_status').notNull().default('pending'),
	onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 }),
}, (table) => [
	uniqueIndex('customers_public_id_unique').on(table.publicId),
	uniqueIndex('customers_user_active_unique').on(table.userId).where(sql`${table.deletedAt} IS NULL`),
	check('customers_public_id_check', sql`${table.publicId} BETWEEN 100000 AND 999999`),
]);

export const workspaces = pgTable('workspaces', {
	id: uuid('id').primaryKey().defaultRandom(),
	publicId: integer('public_id').notNull().default(sql`nextval('workspace_public_id_seq')`),
	name: varchar('name', { length: 160 }).notNull(),
	slug: varchar('slug', { length: 160 }).notNull(),
	type: workspaceTypeEnum('type').notNull().default('personal'),
	status: workspaceStatusEnum('status').notNull().default('active'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 }),
}, (table) => [
	uniqueIndex('workspaces_public_id_unique').on(table.publicId),
	uniqueIndex('workspaces_slug_active_unique').on(table.slug).where(sql`${table.deletedAt} IS NULL`),
	index('workspaces_type_status_idx').on(table.type, table.status),
	check('workspaces_public_id_check', sql`${table.publicId} BETWEEN 100000 AND 999999`),
	check('workspaces_slug_check', sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
]);

export const workspaceMemberships = pgTable('workspace_memberships', {
	id: uuid('id').primaryKey().defaultRandom(),
	workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
	customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'restrict' }),
	role: workspaceMembershipRoleEnum('role').notNull().default('owner'),
	status: workspaceMembershipStatusEnum('status').notNull().default('active'),
	joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
	ownershipStartedAt: timestamp('ownership_started_at', { withTimezone: true }),
	ownershipEndedAt: timestamp('ownership_ended_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 }),
}, (table) => [
	uniqueIndex('workspace_memberships_active_unique').on(table.workspaceId, table.customerId).where(sql`${table.deletedAt} IS NULL`),
	index('workspace_memberships_customer_status_idx').on(table.customerId, table.status),
	index('workspace_memberships_workspace_status_idx').on(table.workspaceId, table.status),
	check('workspace_memberships_ownership_dates_check', sql`${table.ownershipEndedAt} IS NULL OR ${table.ownershipStartedAt} IS NOT NULL`),
]);

export const organisations = pgTable('organisations', {
	id: uuid('id').primaryKey().defaultRandom(),
	workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
	displayName: varchar('display_name', { length: 160 }).notNull(),
	legalName: varchar('legal_name', { length: 200 }),
	gstin: varchar('gstin', { length: 15 }),
	contactEmail: varchar('contact_email', { length: 320 }),
	contactCountryCode: varchar('contact_country_code', { length: 8 }),
	contactMobile: varchar('contact_mobile', { length: 32 }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 }),
}, (table) => [
	uniqueIndex('organisations_workspace_active_unique').on(table.workspaceId).where(sql`${table.deletedAt} IS NULL`),
	index('organisations_display_name_idx').on(table.displayName),
	check('organisations_gstin_check', sql`${table.gstin} IS NULL OR ${table.gstin} ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'`),
]);

/** Immutable workspace billing identity version used for purchase and invoice snapshots. */
export const workspaceBillingProfiles = pgTable('workspace_billing_profiles', {
	id: uuid('id').primaryKey().defaultRandom(),
	workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
	version: integer('version').notNull(),
	displayName: varchar('display_name', { length: 200 }).notNull(),
	legalName: varchar('legal_name', { length: 200 }),
	contactEmail: varchar('contact_email', { length: 320 }).notNull(),
	contactCountryCode: varchar('contact_country_code', { length: 8 }),
	contactMobile: varchar('contact_mobile', { length: 32 }),
	gstin: varchar('gstin', { length: 15 }),
	addressLine1: varchar('address_line_1', { length: 255 }).notNull(),
	addressLine2: varchar('address_line_2', { length: 255 }),
	city: varchar('city', { length: 120 }).notNull(),
	region: varchar('region', { length: 120 }).notNull(),
	postalCode: varchar('postal_code', { length: 20 }).notNull(),
	countryCode: varchar('country_code', { length: 2 }).notNull().default('IN'),
	sourceProfileId: uuid('source_profile_id'),
	createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 }),
}, (table) => [uniqueIndex('workspace_billing_profiles_version_unique').on(table.workspaceId, table.version), index('workspace_billing_profiles_workspace_created_idx').on(table.workspaceId, table.createdAt), check('workspace_billing_profiles_country_check', sql`${table.countryCode} ~ '^[A-Z]{2}$'`)]);

/** Audited owner handoff requiring the recipient customer to accept. */
export const workspaceOwnershipTransfers = pgTable('workspace_ownership_transfers', {
	id: uuid('id').primaryKey().defaultRandom(),
	workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
	fromCustomerId: uuid('from_customer_id').notNull().references(() => customers.id, { onDelete: 'restrict' }),
	toCustomerId: uuid('to_customer_id').notNull().references(() => customers.id, { onDelete: 'restrict' }),
	status: workspaceOwnershipTransferStatusEnum('status').notNull().default('pending'),
	reason: text('reason'),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	respondedAt: timestamp('responded_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 }),
}, (table) => [uniqueIndex('workspace_ownership_transfers_pending_unique').on(table.workspaceId).where(sql`${table.status} = 'pending' AND ${table.deletedAt} IS NULL`), index('workspace_ownership_transfers_recipient_status_idx').on(table.toCustomerId, table.status), check('workspace_ownership_transfers_distinct_check', sql`${table.fromCustomerId} <> ${table.toCustomerId}`)]);

export const customersRelations = relations(customers, ({ many, one }) => ({
	memberships: many(workspaceMemberships),
	user: one(users, { fields: [customers.userId], references: [users.id] }),
}));

export const workspacesRelations = relations(workspaces, ({ many, one }) => ({
	memberships: many(workspaceMemberships),
	organisation: one(organisations),
}));

export const workspaceMembershipsRelations = relations(workspaceMemberships, ({ one }) => ({
	customer: one(customers, { fields: [workspaceMemberships.customerId], references: [customers.id] }),
	workspace: one(workspaces, { fields: [workspaceMemberships.workspaceId], references: [workspaces.id] }),
}));

export const organisationsRelations = relations(organisations, ({ one }) => ({
	workspace: one(workspaces, { fields: [organisations.workspaceId], references: [workspaces.id] }),
}));

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type WorkspaceMembership = typeof workspaceMemberships.$inferSelect;
export type Organisation = typeof organisations.$inferSelect;
export type WorkspaceBillingProfile = typeof workspaceBillingProfiles.$inferSelect;

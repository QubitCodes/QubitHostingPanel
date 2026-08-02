import { relations, sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

import { packagePrices, packages } from './packages';
import { users } from './identity';

export const assignmentStatusEnum = pgEnum('price_assignment_status', ['active', 'ended']);
export const entitlementValueTypeEnum = pgEnum('entitlement_value_type', ['number', 'boolean']);
export const enforcementModeEnum = pgEnum('entitlement_enforcement_mode', ['hard', 'soft', 'metered', 'informational']);
export const costReviewStatusEnum = pgEnum('cost_review_status', ['pending', 'approved', 'rejected']);

export const packagePriceAssignments = pgTable('package_price_assignments', {
	id: uuid('id').primaryKey().defaultRandom(),
	priceId: uuid('price_id').notNull().references(() => packagePrices.id, { onDelete: 'restrict' }),
	userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
	status: assignmentStatusEnum('status').notNull().default('active'),
	termEndsAt: timestamp('term_ends_at', { withTimezone: true }).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 }),
}, (table) => [index('package_price_assignments_active_idx').on(table.priceId, table.status, table.termEndsAt)]);

export const entitlementDefinitions = pgTable('entitlement_definitions', {
	id: uuid('id').primaryKey().defaultRandom(),
	code: varchar('code', { length: 120 }).notNull(),
	name: varchar('name', { length: 160 }).notNull(),
	description: text('description'),
	valueType: entitlementValueTypeEnum('value_type').notNull(),
	unit: varchar('unit', { length: 60 }),
	enforcementMode: enforcementModeEnum('enforcement_mode').notNull(),
	resetPeriod: varchar('reset_period', { length: 30 }),
	isCustomerVisible: boolean('is_customer_visible').notNull().default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 }),
}, (table) => [uniqueIndex('entitlement_definitions_code_unique').on(table.code).where(sql`${table.deletedAt} IS NULL`)]);

export const packageEntitlements = pgTable('package_entitlements', {
	id: uuid('id').primaryKey().defaultRandom(),
	packageId: uuid('package_id').notNull().references(() => packages.id, { onDelete: 'restrict' }),
	entitlementId: uuid('entitlement_id').notNull().references(() => entitlementDefinitions.id, { onDelete: 'restrict' }),
	numericValue: integer('numeric_value'),
	booleanValue: boolean('boolean_value'),
	isUnlimited: boolean('is_unlimited').notNull().default(false),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 }),
}, (table) => [
	uniqueIndex('package_entitlements_active_unique').on(table.packageId, table.entitlementId).where(sql`${table.deletedAt} IS NULL`),
	check('package_entitlements_value_check', sql`(${table.isUnlimited} = true AND ${table.numericValue} IS NULL AND ${table.booleanValue} IS NULL) OR (${table.isUnlimited} = false AND num_nonnulls(${table.numericValue}, ${table.booleanValue}) = 1)`),
]);

export const emailUsageProducts = pgTable('email_usage_products', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: varchar('name', { length: 160 }).notNull(),
	slug: varchar('slug', { length: 160 }).notNull(),
	includedRecipients: integer('included_recipients').notNull(),
	monthlyPriceMinor: integer('monthly_price_minor'),
	isActive: boolean('is_active').notNull().default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 }),
}, (table) => [uniqueIndex('email_usage_products_slug_unique').on(table.slug).where(sql`${table.deletedAt} IS NULL`)]);

export const emailUsageRecords = pgTable('email_usage_records', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
	periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
	periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
	recipientCount: integer('recipient_count').notNull().default(0),
	source: varchar('source', { length: 60 }).notNull().default('amazon_ses'),
	observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 }),
}, (table) => [
	uniqueIndex('email_usage_records_user_period_unique').on(table.userId, table.periodStart, table.periodEnd).where(sql`${table.deletedAt} IS NULL`),
	check('email_usage_records_recipient_count_check', sql`${table.recipientCount} >= 0`),
	check('email_usage_records_period_check', sql`${table.periodEnd} > ${table.periodStart}`),
]);

export const packageCostReviews = pgTable('package_cost_reviews', {
	id: uuid('id').primaryKey().defaultRandom(),
	packageId: uuid('package_id').notNull().references(() => packages.id, { onDelete: 'restrict' }),
	estimatedMonthlyCostMinor: integer('estimated_monthly_cost_minor').notNull(),
	revenueMinor: integer('revenue_minor').notNull(),
	marginBasisPoints: integer('margin_basis_points').notNull(),
	status: costReviewStatusEnum('status').notNull().default('pending'),
	notes: text('notes'),
	reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
	reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 }),
}, (table) => [index('package_cost_reviews_package_idx').on(table.packageId, table.createdAt)]);

export const priceAssignmentRelations = relations(packagePriceAssignments, ({ one }) => ({
	price: one(packagePrices, { fields: [packagePriceAssignments.priceId], references: [packagePrices.id] }),
	user: one(users, { fields: [packagePriceAssignments.userId], references: [users.id] }),
}));
export const packageEntitlementRelations = relations(packageEntitlements, ({ one }) => ({
	package: one(packages, { fields: [packageEntitlements.packageId], references: [packages.id] }),
	definition: one(entitlementDefinitions, { fields: [packageEntitlements.entitlementId], references: [entitlementDefinitions.id] }),
}));

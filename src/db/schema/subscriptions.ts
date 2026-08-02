import { relations, sql } from 'drizzle-orm';
import { bigint, check, index, integer, jsonb, pgEnum, pgSequence, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

import { customers, workspaces } from './tenancy';
import { packagePrices, packages, priceBillingIntervalEnum } from './packages';

export const checkoutStatusEnum = pgEnum('checkout_status', ['purchased', 'configured', 'cancelled']);
export const subscriptionStatusEnum = pgEnum('workspace_subscription_status', ['trialing', 'active', 'cancelled', 'expired']);
export const checkoutPublicIdSequence = pgSequence('checkout_public_id_seq', { startWith: 100000, minValue: 100000, maxValue: 999999, cycle: false });

export const customerCheckouts = pgTable('customer_checkouts', {
	id: uuid('id').primaryKey().defaultRandom(),
	publicId: integer('public_id').notNull().default(sql`nextval('checkout_public_id_seq')`),
	customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'restrict' }),
	packageId: uuid('package_id').notNull().references(() => packages.id, { onDelete: 'restrict' }),
	priceId: uuid('price_id').notNull().references(() => packagePrices.id, { onDelete: 'restrict' }),
	workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'restrict' }),
	status: checkoutStatusEnum('status').notNull().default('purchased'),
	packageNameSnapshot: varchar('package_name_snapshot', { length: 160 }).notNull(),
	currency: varchar('currency', { length: 3 }).notNull(),
	billingInterval: priceBillingIntervalEnum('billing_interval').notNull(),
	intervalCount: integer('interval_count').notNull(),
	subtotalMinor: bigint('subtotal_minor', { mode: 'number' }).notNull(),
	discountMinor: bigint('discount_minor', { mode: 'number' }).notNull(),
	taxMinor: bigint('tax_minor', { mode: 'number' }).notNull(),
	totalMinor: bigint('total_minor', { mode: 'number' }).notNull(),
	appliedOfferIds: jsonb('applied_offer_ids').$type<string[]>().notNull().default([]),
	purchasedAt: timestamp('purchased_at', { withTimezone: true }).notNull().defaultNow(),
	configuredAt: timestamp('configured_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 }),
}, (table) => [
	uniqueIndex('customer_checkouts_public_id_unique').on(table.publicId),
	index('customer_checkouts_customer_status_idx').on(table.customerId, table.status),
	check('customer_checkouts_public_id_check', sql`${table.publicId} BETWEEN 100000 AND 999999`),
	check('customer_checkouts_amounts_check', sql`${table.subtotalMinor} >= 0 AND ${table.discountMinor} >= 0 AND ${table.taxMinor} >= 0 AND ${table.totalMinor} >= 0`),
]);

export const workspaceSubscriptions = pgTable('workspace_subscriptions', {
	id: uuid('id').primaryKey().defaultRandom(),
	workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
	checkoutId: uuid('checkout_id').notNull().references(() => customerCheckouts.id, { onDelete: 'restrict' }),
	packageId: uuid('package_id').notNull().references(() => packages.id, { onDelete: 'restrict' }),
	priceId: uuid('price_id').notNull().references(() => packagePrices.id, { onDelete: 'restrict' }),
	status: subscriptionStatusEnum('status').notNull().default('active'),
	packageSnapshot: jsonb('package_snapshot').$type<Record<string, unknown>>().notNull(),
	entitlementSnapshot: jsonb('entitlement_snapshot').$type<Array<Record<string, unknown>>>().notNull(),
	startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
	trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
	termEndsAt: timestamp('term_ends_at', { withTimezone: true }).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: text('delete_reason'),
}, (table) => [
	uniqueIndex('workspace_subscriptions_checkout_unique').on(table.checkoutId),
	index('workspace_subscriptions_workspace_status_idx').on(table.workspaceId, table.status),
]);

export const customerCheckoutRelations = relations(customerCheckouts, ({ one }) => ({ customer: one(customers, { fields: [customerCheckouts.customerId], references: [customers.id] }), workspace: one(workspaces, { fields: [customerCheckouts.workspaceId], references: [workspaces.id] }) }));
export const workspaceSubscriptionRelations = relations(workspaceSubscriptions, ({ one }) => ({ checkout: one(customerCheckouts, { fields: [workspaceSubscriptions.checkoutId], references: [customerCheckouts.id] }), workspace: one(workspaces, { fields: [workspaceSubscriptions.workspaceId], references: [workspaces.id] }) }));

import { relations, sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

import { packagePrices, packages, priceBillingIntervalEnum } from './packages';

export const offerDiscountTypeEnum = pgEnum('offer_discount_type', ['percentage', 'fixed']);
export const offerStatusEnum = pgEnum('offer_status', ['draft', 'active', 'archived']);
export const offerCustomerEligibilityEnum = pgEnum('offer_customer_eligibility', ['everyone', 'new_customers', 'existing_customers']);
export const offerSubscriptionEventEnum = pgEnum('offer_subscription_event', ['new_subscription', 'renewal', 'both']);
export const offerDiscountRecurrenceEnum = pgEnum('offer_discount_recurrence', ['once', 'cycles', 'term']);
export const offerTrialHandlingEnum = pgEnum('offer_trial_handling', ['after_trial', 'immediate', 'exclude_trial']);

export const offers = pgTable('offers', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: varchar('name', { length: 160 }).notNull(),
	slug: varchar('slug', { length: 160 }).notNull(),
	description: text('description'),
	couponCode: varchar('coupon_code', { length: 60 }),
	discountType: offerDiscountTypeEnum('discount_type').notNull(),
	percentageBasisPoints: integer('percentage_basis_points'),
	fixedAmountMinor: integer('fixed_amount_minor'),
	currency: varchar('currency', { length: 3 }).notNull().default('INR'),
	status: offerStatusEnum('status').notNull().default('draft'),
	startsAt: timestamp('starts_at', { withTimezone: true }),
	endsAt: timestamp('ends_at', { withTimezone: true }),
	newCustomerOnly: boolean('new_customer_only').notNull().default(false),
	customerEligibility: offerCustomerEligibilityEnum('customer_eligibility').notNull().default('everyone'),
	subscriptionEvent: offerSubscriptionEventEnum('subscription_event').notNull().default('both'),
	discountRecurrence: offerDiscountRecurrenceEnum('discount_recurrence').notNull().default('once'),
	recurrenceCycles: integer('recurrence_cycles'),
	trialHandling: offerTrialHandlingEnum('trial_handling').notNull().default('after_trial'),
	minimumSubtotalMinor: integer('minimum_subtotal_minor'),
	maximumDiscountMinor: integer('maximum_discount_minor'),
	maxRedemptions: integer('max_redemptions'),
	maxRedemptionsPerCustomer: integer('max_redemptions_per_customer').notNull().default(1),
	stackable: boolean('stackable').notNull().default(false),
	priority: integer('priority').notNull().default(0),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 }),
}, (table) => [
	uniqueIndex('offers_slug_unique').on(table.slug).where(sql`${table.deletedAt} IS NULL`),
	uniqueIndex('offers_coupon_code_unique').on(table.couponCode).where(sql`${table.couponCode} IS NOT NULL AND ${table.deletedAt} IS NULL`),
	index('offers_active_period_idx').on(table.status, table.startsAt, table.endsAt),
	check('offers_discount_value_check', sql`(${table.discountType} = 'percentage' AND ${table.percentageBasisPoints} > 0 AND ${table.percentageBasisPoints} <= 10000 AND ${table.fixedAmountMinor} IS NULL) OR (${table.discountType} = 'fixed' AND ${table.fixedAmountMinor} > 0 AND ${table.percentageBasisPoints} IS NULL)`),
	check('offers_period_check', sql`${table.endsAt} IS NULL OR ${table.startsAt} IS NULL OR ${table.endsAt} > ${table.startsAt}`),
	check('offers_recurrence_cycles_check', sql`(${table.discountRecurrence} = 'cycles' AND ${table.recurrenceCycles} > 0) OR (${table.discountRecurrence} <> 'cycles' AND ${table.recurrenceCycles} IS NULL)`),
	check('offers_minimum_subtotal_check', sql`${table.minimumSubtotalMinor} IS NULL OR ${table.minimumSubtotalMinor} > 0`),
	check('offers_maximum_discount_check', sql`${table.maximumDiscountMinor} IS NULL OR ${table.maximumDiscountMinor} > 0`),
]);

export const offerEligiblePrices = pgTable('offer_eligible_prices', {
	id: uuid('id').primaryKey().defaultRandom(),
	offerId: uuid('offer_id').notNull().references(() => offers.id, { onDelete: 'restrict' }),
	packageId: uuid('package_id').references(() => packages.id, { onDelete: 'restrict' }),
	priceId: uuid('price_id').references(() => packagePrices.id, { onDelete: 'restrict' }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 }),
}, (table) => [uniqueIndex('offer_eligible_prices_unique').on(table.offerId, table.packageId, table.priceId).where(sql`${table.deletedAt} IS NULL`), check('offer_eligible_prices_target_check', sql`num_nonnulls(${table.packageId}, ${table.priceId}) = 1`)]);

export const offerEligibleTerms = pgTable('offer_eligible_terms', {
	id: uuid('id').primaryKey().defaultRandom(),
	offerId: uuid('offer_id').notNull().references(() => offers.id, { onDelete: 'restrict' }),
	billingInterval: priceBillingIntervalEnum('billing_interval').notNull(),
	intervalCount: integer('interval_count').notNull().default(1),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 }),
}, (table) => [
	uniqueIndex('offer_eligible_terms_unique').on(table.offerId, table.billingInterval, table.intervalCount).where(sql`${table.deletedAt} IS NULL`),
	check('offer_eligible_terms_interval_count_check', sql`${table.intervalCount} > 0`),
]);

export const offerRedemptions = pgTable('offer_redemptions', {
	id: uuid('id').primaryKey().defaultRandom(),
	offerId: uuid('offer_id').notNull().references(() => offers.id, { onDelete: 'restrict' }),
	checkoutReference: uuid('checkout_reference').notNull(),
	customerReference: varchar('customer_reference', { length: 160 }),
	redeemedAt: timestamp('redeemed_at', { withTimezone: true }).notNull().defaultNow(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 }),
}, (table) => [index('offer_redemptions_offer_customer_idx').on(table.offerId, table.customerReference)]);

export const offerRelations = relations(offers, ({ many }) => ({ eligiblePrices: many(offerEligiblePrices), eligibleTerms: many(offerEligibleTerms), redemptions: many(offerRedemptions) }));

import { relations, sql } from 'drizzle-orm';
import {
	boolean,
	check,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
	bigint,
} from 'drizzle-orm/pg-core';

export const packageStatusEnum = pgEnum('package_status', [
	'draft',
	'published',
	'archived',
]);
export const trialDurationUnitEnum = pgEnum('trial_duration_unit', [
	'day',
	'week',
	'month',
]);
export const priceBillingIntervalEnum = pgEnum('price_billing_interval', [
	'month',
	'year',
]);
export const priceTaxBehaviorEnum = pgEnum('price_tax_behavior', [
	'exclusive',
	'inclusive',
]);

export const packageCategories = pgTable(
	'package_categories',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		name: varchar('name', { length: 120 }).notNull(),
		slug: varchar('slug', { length: 120 }).notNull(),
		description: varchar('description', { length: 500 }),
		isActive: boolean('is_active').notNull().default(true),
		displayOrder: integer('display_order').notNull().default(0),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		deletedAt: timestamp('deleted_at', { withTimezone: true }),
		deleteReason: varchar('delete_reason', { length: 500 }),
	},
	(table) => [
		uniqueIndex('package_categories_slug_unique')
			.on(table.slug)
			.where(sql`${table.deletedAt} IS NULL`),
		index('package_categories_active_order_idx').on(
			table.isActive,
			table.displayOrder,
		),
	],
);

export const packages = pgTable(
	'packages',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		categoryId: uuid('category_id').references(() => packageCategories.id, {
			onDelete: 'set null',
		}),
		name: varchar('name', { length: 160 }).notNull(),
		slug: varchar('slug', { length: 160 }).notNull(),
		description: text('description'),
		status: packageStatusEnum('status').notNull().default('draft'),
		isFeatured: boolean('is_featured').notNull().default(false),
		displayOrder: integer('display_order').notNull().default(0),
		trialEnabled: boolean('trial_enabled').notNull().default(false),
		trialDuration: integer('trial_duration'),
		trialDurationUnit: trialDurationUnitEnum('trial_duration_unit'),
		publishedAt: timestamp('published_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		deletedAt: timestamp('deleted_at', { withTimezone: true }),
		deleteReason: varchar('delete_reason', { length: 500 }),
	},
	(table) => [
		check(
			'packages_trial_configuration_check',
			sql`(${table.trialEnabled} = false AND ${table.trialDuration} IS NULL AND ${table.trialDurationUnit} IS NULL) OR (${table.trialEnabled} = true AND ${table.trialDuration} > 0 AND ${table.trialDurationUnit} IS NOT NULL)`,
		),
		uniqueIndex('packages_slug_unique')
			.on(table.slug)
			.where(sql`${table.deletedAt} IS NULL`),
		index('packages_status_order_idx').on(table.status, table.displayOrder),
		index('packages_category_idx').on(table.categoryId),
		index('packages_published_idx').on(table.publishedAt),
	],
);

export const packagePrices = pgTable(
	'package_prices',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		packageId: uuid('package_id').notNull().references(() => packages.id, {
			onDelete: 'restrict',
		}),
		currency: varchar('currency', { length: 3 }).notNull().default('INR'),
		billingInterval: priceBillingIntervalEnum('billing_interval').notNull(),
		intervalCount: integer('interval_count').notNull().default(1),
		amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
		taxBehavior: priceTaxBehaviorEnum('tax_behavior').notNull().default('exclusive'),
		isActive: boolean('is_active').notNull().default(true),
		isPublic: boolean('is_public').notNull().default(false),
		effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
		effectiveUntil: timestamp('effective_until', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		deletedAt: timestamp('deleted_at', { withTimezone: true }),
		deleteReason: varchar('delete_reason', { length: 500 }),
	},
	(table) => [
		check('package_prices_interval_count_check', sql`${table.intervalCount} > 0`),
		check('package_prices_amount_minor_check', sql`${table.amountMinor} >= 0`),
		index('package_prices_package_history_idx').on(
			table.packageId,
			table.billingInterval,
			table.effectiveFrom,
		),
		uniqueIndex('package_prices_current_public_unique')
			.on(table.packageId, table.currency, table.billingInterval, table.intervalCount)
			.where(sql`${table.isActive} = true AND ${table.isPublic} = true AND ${table.deletedAt} IS NULL`),
	],
);

export const packageCategoriesRelations = relations(
	packageCategories,
	({ many }) => ({ packages: many(packages) }),
);
export const packagesRelations = relations(packages, ({ one, many }) => ({
	category: one(packageCategories, {
		fields: [packages.categoryId],
		references: [packageCategories.id],
	}),
	prices: many(packagePrices),
}));
export const packagePricesRelations = relations(packagePrices, ({ one }) => ({
	package: one(packages, {
		fields: [packagePrices.packageId],
		references: [packages.id],
	}),
}));

export type Package = typeof packages.$inferSelect;
export type NewPackage = typeof packages.$inferInsert;
export type PackageCategory = typeof packageCategories.$inferSelect;
export type PackagePrice = typeof packagePrices.$inferSelect;

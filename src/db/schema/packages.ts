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

export const packageCategoriesRelations = relations(
	packageCategories,
	({ many }) => ({ packages: many(packages) }),
);
export const packagesRelations = relations(packages, ({ one }) => ({
	category: one(packageCategories, {
		fields: [packages.categoryId],
		references: [packageCategories.id],
	}),
}));

export type Package = typeof packages.$inferSelect;
export type NewPackage = typeof packages.$inferInsert;
export type PackageCategory = typeof packageCategories.$inferSelect;

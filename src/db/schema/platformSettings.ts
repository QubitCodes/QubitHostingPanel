import { sql } from 'drizzle-orm';
import { boolean, check, pgEnum, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

export const panelDomainModeEnum = pgEnum('panel_domain_mode', ['same_domain', 'separate_domain']);
export const domainVerificationStatusEnum = pgEnum('domain_verification_status', ['pending', 'verified', 'failed']);

/** Singleton platform URL and customer-application domain policy. */
export const platformSettings = pgTable('platform_settings', {
	id: uuid('id').primaryKey().defaultRandom(),
	key: varchar('key', { length: 40 }).notNull().default('default'),
	publicBaseUrl: varchar('public_base_url', { length: 500 }).notNull(),
	panelDomainMode: panelDomainModeEnum('panel_domain_mode').notNull().default('same_domain'),
	panelBaseUrl: varchar('panel_base_url', { length: 500 }),
	panelDomainStatus: domainVerificationStatusEnum('panel_domain_status').notNull().default('pending'),
	applicationBaseDomain: varchar('application_base_domain', { length: 255 }).notNull(),
	applicationDomainStatus: domainVerificationStatusEnum('application_domain_status').notNull().default('pending'),
	defaultApplicationSubdomainEnabled: boolean('default_application_subdomain_enabled').notNull().default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 }),
}, (table) => [
	uniqueIndex('platform_settings_key_active_unique').on(table.key).where(sql`${table.deletedAt} IS NULL`),
	check('platform_settings_panel_url_check', sql`${table.panelDomainMode} = 'same_domain' OR ${table.panelBaseUrl} IS NOT NULL`),
]);

export type PlatformSettings = typeof platformSettings.$inferSelect;

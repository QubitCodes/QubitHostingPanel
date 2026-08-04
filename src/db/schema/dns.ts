import { relations, sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

import { applicationDomains } from './sharedPlatform';
import { domainOwnerships } from './domainOwnership';
import { workspaces } from './tenancy';

export const dnsZoneStatusEnum = pgEnum('dns_zone_status', ['draft', 'pending_delegation', 'active', 'failed']);
export const dnsProviderEnum = pgEnum('dns_provider', ['cloudflare', 'godaddy', 'hostinger', 'route53', 'manual']);
export const dnsRecordSourceEnum = pgEnum('dns_record_source', ['discovered', 'imported', 'user', 'platform_managed']);

/** One authoritative DNS zone controlled by a verified workspace domain owner. */
export const dnsZones = pgTable('dns_zones', {
	id: uuid('id').primaryKey().defaultRandom(),
	workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
	ownershipId: uuid('ownership_id').notNull().references(() => domainOwnerships.id, { onDelete: 'restrict' }),
	hostname: varchar('hostname', { length: 255 }).notNull(),
	provider: dnsProviderEnum('provider').notNull().default('cloudflare'),
	providerZoneId: varchar('provider_zone_id', { length: 255 }),
	status: dnsZoneStatusEnum('status').notNull().default('draft'),
	nameservers: jsonb('nameservers').$type<string[]>().notNull().default([]),
	delegationVerifiedAt: timestamp('delegation_verified_at', { withTimezone: true }),
	lastImportedAt: timestamp('last_imported_at', { withTimezone: true }),
	lastSynchronizedAt: timestamp('last_synchronized_at', { withTimezone: true }),
	lastError: text('last_error'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 }),
}, (table) => [uniqueIndex('dns_zones_ownership_active_unique').on(table.ownershipId).where(sql`${table.deletedAt} IS NULL`), index('dns_zones_workspace_status_idx').on(table.workspaceId, table.status)]);

/** Reviewable DNS record with explicit provenance and safe platform ownership. */
export const dnsRecords = pgTable('dns_records', {
	id: uuid('id').primaryKey().defaultRandom(),
	zoneId: uuid('zone_id').notNull().references(() => dnsZones.id, { onDelete: 'restrict' }),
	applicationDomainId: uuid('application_domain_id').references(() => applicationDomains.id, { onDelete: 'set null' }),
	name: varchar('name', { length: 255 }).notNull(),
	type: varchar('type', { length: 16 }).notNull(),
	content: text('content').notNull(),
	ttl: integer('ttl').notNull().default(300),
	priority: integer('priority'),
	proxied: boolean('proxied').notNull().default(false),
	source: dnsRecordSourceEnum('source').notNull(),
	providerRecordId: varchar('provider_record_id', { length: 255 }),
	isEnabled: boolean('is_enabled').notNull().default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 }),
}, (table) => [uniqueIndex('dns_records_value_active_unique').on(table.zoneId, table.name, table.type, table.content).where(sql`${table.deletedAt} IS NULL`), index('dns_records_zone_name_idx').on(table.zoneId, table.name), index('dns_records_application_domain_idx').on(table.applicationDomainId)]);

export const dnsImportRuns = pgTable('dns_import_runs', {
	id: uuid('id').primaryKey().defaultRandom(), zoneId: uuid('zone_id').notNull().references(() => dnsZones.id, { onDelete: 'restrict' }), source: dnsProviderEnum('source').notNull(), status: varchar('status', { length: 32 }).notNull(), discoveredCount: integer('discovered_count').notNull().default(0), warnings: jsonb('warnings').$type<string[]>().notNull().default([]), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(), deletedAt: timestamp('deleted_at', { withTimezone: true }), deleteReason: varchar('delete_reason', { length: 500 }),
});

export const dnsZoneRelations = relations(dnsZones, ({ many, one }) => ({ ownership: one(domainOwnerships, { fields: [dnsZones.ownershipId], references: [domainOwnerships.id] }), records: many(dnsRecords), workspace: one(workspaces, { fields: [dnsZones.workspaceId], references: [workspaces.id] }) }));
export const dnsRecordRelations = relations(dnsRecords, ({ one }) => ({ zone: one(dnsZones, { fields: [dnsRecords.zoneId], references: [dnsZones.id] }), applicationDomain: one(applicationDomains, { fields: [dnsRecords.applicationDomainId], references: [applicationDomains.id] }) }));

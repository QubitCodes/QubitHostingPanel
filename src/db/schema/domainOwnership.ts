import { relations, sql } from 'drizzle-orm';
import { index, pgEnum, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

import { applicationBuilds, applicationDomains } from './sharedPlatform';
import { workspaces } from './tenancy';

export const domainOwnershipStatusEnum = pgEnum('domain_ownership_status', ['pending', 'verified', 'revoked']);
export const domainAccessRequestStatusEnum = pgEnum('domain_access_request_status', ['pending', 'approved', 'rejected', 'revoked']);

/** Verified workspace control over one hostname and its descendant subdomains. */
export const domainOwnerships = pgTable('domain_ownerships', {
	id: uuid('id').primaryKey().defaultRandom(),
	workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
	hostname: varchar('hostname', { length: 255 }).notNull(),
	status: domainOwnershipStatusEnum('status').notNull().default('pending'),
	verificationToken: varchar('verification_token', { length: 120 }),
	verificationMethod: varchar('verification_method', { length: 40 }).notNull().default('dns_txt'),
	verifiedAt: timestamp('verified_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 }),
}, (table) => [
	uniqueIndex('domain_ownerships_hostname_active_unique').on(table.hostname).where(sql`${table.deletedAt} IS NULL AND ${table.status} <> 'revoked'`),
	index('domain_ownerships_workspace_status_idx').on(table.workspaceId, table.status),
]);

/** Owner-controlled permission for another workspace to attach one protected hostname. */
export const domainAccessRequests = pgTable('domain_access_requests', {
	id: uuid('id').primaryKey().defaultRandom(),
	ownershipId: uuid('ownership_id').notNull().references(() => domainOwnerships.id, { onDelete: 'restrict' }),
	requestingWorkspaceId: uuid('requesting_workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
	applicationBuildId: uuid('application_build_id').notNull().references(() => applicationBuilds.id, { onDelete: 'restrict' }),
	applicationDomainId: uuid('application_domain_id').notNull().references(() => applicationDomains.id, { onDelete: 'restrict' }),
	hostname: varchar('hostname', { length: 255 }).notNull(),
	status: domainAccessRequestStatusEnum('status').notNull().default('pending'),
	respondedAt: timestamp('responded_at', { withTimezone: true }),
	respondedByWorkspaceId: uuid('responded_by_workspace_id').references(() => workspaces.id, { onDelete: 'restrict' }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 }),
}, (table) => [
	uniqueIndex('domain_access_requests_domain_active_unique').on(table.applicationDomainId).where(sql`${table.deletedAt} IS NULL AND ${table.status} IN ('pending', 'approved')`),
	index('domain_access_requests_ownership_status_idx').on(table.ownershipId, table.status),
	index('domain_access_requests_requester_status_idx').on(table.requestingWorkspaceId, table.status),
]);

export const domainOwnershipRelations = relations(domainOwnerships, ({ many, one }) => ({ requests: many(domainAccessRequests), workspace: one(workspaces, { fields: [domainOwnerships.workspaceId], references: [workspaces.id] }) }));
export const domainAccessRequestRelations = relations(domainAccessRequests, ({ one }) => ({ ownership: one(domainOwnerships, { fields: [domainAccessRequests.ownershipId], references: [domainOwnerships.id] }), requestingWorkspace: one(workspaces, { fields: [domainAccessRequests.requestingWorkspaceId], references: [workspaces.id] }), application: one(applicationBuilds, { fields: [domainAccessRequests.applicationBuildId], references: [applicationBuilds.id] }), domain: one(applicationDomains, { fields: [domainAccessRequests.applicationDomainId], references: [applicationDomains.id] }) }));

import { relations, sql } from 'drizzle-orm';
import {
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from 'drizzle-orm/pg-core';

import { users } from './identity';
import { providerConnections } from './providerConnections';

export const platformDeploymentStatusEnum = pgEnum(
	'platform_deployment_status',
	['queued', 'running', 'succeeded', 'failed', 'cancelled'],
);

/** Durable record for a deployment of the Ghost Deploy control-plane application itself. */
export const platformDeployments = pgTable(
	'platform_deployments',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		providerConnectionId: uuid('provider_connection_id').references(
			() => providerConnections.id,
			{ onDelete: 'restrict' },
		),
		targetApplicationUuid: varchar('target_application_uuid', {
			length: 120,
		}).notNull(),
		providerDeploymentId: varchar('provider_deployment_id', { length: 160 }),
		requestedByUserId: uuid('requested_by_user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'restrict' }),
		status: platformDeploymentStatusEnum('status').notNull().default('queued'),
		providerStatus: varchar('provider_status', { length: 120 }),
		commitSha: varchar('commit_sha', { length: 160 }),
		commitMessage: text('commit_message'),
		logs: text('logs').notNull().default(''),
		failureMessage: text('failure_message'),
		lastPollError: varchar('last_poll_error', { length: 500 }),
		startedAt: timestamp('started_at', { withTimezone: true }),
		completedAt: timestamp('completed_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		deletedAt: timestamp('deleted_at', { withTimezone: true }),
		deleteReason: varchar('delete_reason', { length: 500 }),
	},
	(table) => [
		uniqueIndex('platform_deployments_active_target_unique')
			.on(table.targetApplicationUuid)
			.where(
				sql`${table.status} IN ('queued', 'running') AND ${table.deletedAt} IS NULL`,
			),
		index('platform_deployments_created_idx').on(table.createdAt),
		index('platform_deployments_provider_deployment_idx').on(
			table.providerDeploymentId,
		),
	],
);

export const platformDeploymentRelations = relations(
	platformDeployments,
	({ one }) => ({
		providerConnection: one(providerConnections, {
			fields: [platformDeployments.providerConnectionId],
			references: [providerConnections.id],
		}),
		requestedBy: one(users, {
			fields: [platformDeployments.requestedByUserId],
			references: [users.id],
		}),
	}),
);

export type PlatformDeployment = typeof platformDeployments.$inferSelect;

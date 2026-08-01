import { jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const auditLogs = pgTable('audit_logs', {
	id: uuid('id').primaryKey().defaultRandom(),
	actorUserId: uuid('actor_user_id'),
	action: varchar('action', { length: 120 }).notNull(),
	resourceType: varchar('resource_type', { length: 120 }).notNull(),
	resourceId: uuid('resource_id'),
	reason: varchar('reason', { length: 500 }),
	metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
	ipAddress: varchar('ip_address', { length: 64 }),
	userAgent: varchar('user_agent', { length: 500 }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 })
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

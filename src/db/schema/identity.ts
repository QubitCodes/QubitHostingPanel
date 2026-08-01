import { relations, sql } from 'drizzle-orm';
import {
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	timestamp,
	uniqueIndex,
	uuid,
	varchar
} from 'drizzle-orm/pg-core';

export const userStatusEnum = pgEnum('user_status', ['active', 'inactive', 'suspended']);
export const otpChannelEnum = pgEnum('otp_channel', ['whatsapp']);
export const otpPurposeEnum = pgEnum('otp_purpose', ['login', 'context_switch', 'sensitive_action']);
export const otpDeliveryStatusEnum = pgEnum('otp_delivery_status', ['pending', 'submitted', 'failed']);
export const sessionContextTypeEnum = pgEnum('session_context_type', ['personal', 'admin', 'organisation']);
export const authenticationEventTypeEnum = pgEnum('authentication_event_type', [
	'otp_requested',
	'otp_delivery_failed',
	'otp_verification_failed',
	'login_succeeded',
	'refresh_succeeded',
	'session_revoked',
	'context_switched'
]);
export const authenticationEventStatusEnum = pgEnum('authentication_event_status', ['success', 'failure']);

export const users = pgTable('users', {
	id: uuid('id').primaryKey().defaultRandom(),
	localMobileNumber: varchar('local_mobile_number', { length: 32 }).notNull(),
	countryCallingCode: varchar('country_calling_code', { length: 8 }).notNull(),
	mobileE164: varchar('mobile_e164', { length: 20 }).notNull(),
	displayName: varchar('display_name', { length: 160 }),
	status: userStatusEnum('status').notNull().default('active'),
	mobileVerifiedAt: timestamp('mobile_verified_at', { withTimezone: true }),
	tokenVersion: integer('token_version').notNull().default(1),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 })
}, (table) => [
	index('users_local_mobile_idx').on(table.localMobileNumber),
	uniqueIndex('users_mobile_e164_unique').on(table.mobileE164).where(sql`${table.deletedAt} IS NULL`)
]);

export const externalIdentities = pgTable('external_identities', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	provider: varchar('provider', { length: 50 }).notNull(),
	providerSubject: varchar('provider_subject', { length: 255 }).notNull(),
	metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
	verifiedAt: timestamp('verified_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 })
}, (table) => [
	index('external_identities_user_idx').on(table.userId),
	uniqueIndex('external_identities_provider_subject_unique')
		.on(table.provider, table.providerSubject)
		.where(sql`${table.deletedAt} IS NULL`)
]);

export const otpChallenges = pgTable('otp_challenges', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
	identityHash: varchar('identity_hash', { length: 64 }).notNull(),
	maskedDestination: varchar('masked_destination', { length: 32 }).notNull(),
	channel: otpChannelEnum('channel').notNull().default('whatsapp'),
	purpose: otpPurposeEnum('purpose').notNull().default('login'),
	otpHash: varchar('otp_hash', { length: 128 }).notNull(),
	otpSalt: varchar('otp_salt', { length: 64 }).notNull(),
	deliveryStatus: otpDeliveryStatusEnum('delivery_status').notNull().default('pending'),
	providerReference: varchar('provider_reference', { length: 255 }),
	attemptCount: integer('attempt_count').notNull().default(0),
	maxAttempts: integer('max_attempts').notNull().default(5),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	resendAvailableAt: timestamp('resend_available_at', { withTimezone: true }).notNull(),
	consumedAt: timestamp('consumed_at', { withTimezone: true }),
	requestIpHash: varchar('request_ip_hash', { length: 64 }),
	userAgent: varchar('user_agent', { length: 500 }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 })
}, (table) => [
	index('otp_challenges_identity_created_idx').on(table.identityHash, table.createdAt),
	index('otp_challenges_user_created_idx').on(table.userId, table.createdAt)
]);

export const userSessions = pgTable('user_sessions', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	refreshTokenHash: varchar('refresh_token_hash', { length: 128 }).notNull(),
	activeContextType: sessionContextTypeEnum('active_context_type').notNull().default('personal'),
	activeOrganisationId: uuid('active_organisation_id'),
	tokenVersion: integer('token_version').notNull().default(1),
	ipAddress: varchar('ip_address', { length: 64 }),
	location: varchar('location', { length: 255 }),
	userAgent: varchar('user_agent', { length: 500 }),
	lastActiveAt: timestamp('last_active_at', { withTimezone: true }).notNull().defaultNow(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	revokedAt: timestamp('revoked_at', { withTimezone: true }),
	revokeReason: varchar('revoke_reason', { length: 500 }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 })
}, (table) => [
	index('user_sessions_user_idx').on(table.userId),
	uniqueIndex('user_sessions_refresh_token_unique').on(table.refreshTokenHash)
]);

export const authenticationEvents = pgTable('authentication_events', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
	challengeId: uuid('challenge_id').references(() => otpChallenges.id, { onDelete: 'set null' }),
	type: authenticationEventTypeEnum('type').notNull(),
	status: authenticationEventStatusEnum('status').notNull(),
	identityHash: varchar('identity_hash', { length: 64 }),
	reason: varchar('reason', { length: 500 }),
	ipAddress: varchar('ip_address', { length: 64 }),
	userAgent: varchar('user_agent', { length: 500 }),
	metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 })
}, (table) => [
	index('authentication_events_user_created_idx').on(table.userId, table.createdAt),
	index('authentication_events_identity_created_idx').on(table.identityHash, table.createdAt)
]);

export const usersRelations = relations(users, ({ many }) => ({
	authenticationEvents: many(authenticationEvents),
	externalIdentities: many(externalIdentities),
	otpChallenges: many(otpChallenges),
	sessions: many(userSessions)
}));

export const externalIdentitiesRelations = relations(externalIdentities, ({ one }) => ({
	user: one(users, { fields: [externalIdentities.userId], references: [users.id] })
}));

export const otpChallengesRelations = relations(otpChallenges, ({ many, one }) => ({
	authenticationEvents: many(authenticationEvents),
	user: one(users, { fields: [otpChallenges.userId], references: [users.id] })
}));

export const userSessionsRelations = relations(userSessions, ({ one }) => ({
	user: one(users, { fields: [userSessions.userId], references: [users.id] })
}));

export const authenticationEventsRelations = relations(authenticationEvents, ({ one }) => ({
	challenge: one(otpChallenges, { fields: [authenticationEvents.challengeId], references: [otpChallenges.id] }),
	user: one(users, { fields: [authenticationEvents.userId], references: [users.id] })
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type OtpChallenge = typeof otpChallenges.$inferSelect;
export type UserSession = typeof userSessions.$inferSelect;

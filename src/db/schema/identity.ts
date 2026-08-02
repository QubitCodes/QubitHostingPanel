import { relations, sql } from 'drizzle-orm';
import {
	index,
	integer,
	jsonb,
	pgEnum,
	pgSequence,
	pgTable,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from 'drizzle-orm/pg-core';

export const userStatusEnum = pgEnum('user_status', [
	'active',
	'inactive',
	'suspended',
]);
export const otpChannelEnum = pgEnum('otp_channel', ['whatsapp']);
export const otpPurposeEnum = pgEnum('otp_purpose', [
	'login',
	'context_switch',
	'sensitive_action',
]);
export const otpDeliveryStatusEnum = pgEnum('otp_delivery_status', [
	'pending',
	'submitted',
	'failed',
]);
export const sessionContextTypeEnum = pgEnum('session_context_type', [
	'personal',
	'admin',
	'organisation',
]);
export const authenticationEventTypeEnum = pgEnum('authentication_event_type', [
	'otp_requested',
	'otp_delivery_failed',
	'otp_verification_failed',
	'login_succeeded',
	'refresh_succeeded',
	'session_revoked',
	'context_switched',
]);
export const authenticationEventStatusEnum = pgEnum(
	'authentication_event_status',
	['success', 'failure'],
);

export const userPublicIdSequence = pgSequence('user_public_id_seq', {
	startWith: 100000,
	minValue: 100000,
	maxValue: 999999,
	cycle: false,
});

export const users = pgTable(
	'users',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		publicId: integer('public_id')
			.notNull()
			.default(sql`nextval('user_public_id_seq')`),
		mobile: varchar('mobile', { length: 32 }).notNull(),
		countryCode: varchar('country_code', { length: 8 }).notNull(),
		displayName: varchar('display_name', { length: 160 }),
		status: userStatusEnum('status').notNull().default('active'),
		mobileVerifiedAt: timestamp('mobile_verified_at', { withTimezone: true }),
		tokenVersion: integer('token_version').notNull().default(1),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		deletedAt: timestamp('deleted_at', { withTimezone: true }),
		deleteReason: varchar('delete_reason', { length: 500 }),
	},
	(table) => [
		uniqueIndex('users_public_id_unique').on(table.publicId),
		index('users_mobile_idx').on(table.mobile),
		uniqueIndex('users_country_mobile_unique')
			.on(table.countryCode, table.mobile)
			.where(sql`${table.deletedAt} IS NULL`),
	],
);

export const externalIdentities = pgTable(
	'external_identities',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		provider: varchar('provider', { length: 50 }).notNull(),
		providerSubject: varchar('provider_subject', { length: 255 }).notNull(),
		metadata: jsonb('metadata')
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		verifiedAt: timestamp('verified_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		deletedAt: timestamp('deleted_at', { withTimezone: true }),
		deleteReason: varchar('delete_reason', { length: 500 }),
	},
	(table) => [
		index('external_identities_user_idx').on(table.userId),
		uniqueIndex('external_identities_provider_subject_unique')
			.on(table.provider, table.providerSubject)
			.where(sql`${table.deletedAt} IS NULL`),
	],
);

export const otpChallenges = pgTable(
	'otp_challenges',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id').references(() => users.id, {
			onDelete: 'set null',
		}),
		identityHash: varchar('identity_hash', { length: 64 }).notNull(),
		maskedDestination: varchar('masked_destination', { length: 32 }).notNull(),
		channel: otpChannelEnum('channel').notNull().default('whatsapp'),
		purpose: otpPurposeEnum('purpose').notNull().default('login'),
		otpHash: varchar('otp_hash', { length: 128 }).notNull(),
		otpSalt: varchar('otp_salt', { length: 64 }).notNull(),
		deliveryStatus: otpDeliveryStatusEnum('delivery_status')
			.notNull()
			.default('pending'),
		providerReference: varchar('provider_reference', { length: 255 }),
		attemptCount: integer('attempt_count').notNull().default(0),
		maxAttempts: integer('max_attempts').notNull().default(5),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		resendAvailableAt: timestamp('resend_available_at', {
			withTimezone: true,
		}).notNull(),
		consumedAt: timestamp('consumed_at', { withTimezone: true }),
		requestIpHash: varchar('request_ip_hash', { length: 64 }),
		userAgent: varchar('user_agent', { length: 500 }),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		deletedAt: timestamp('deleted_at', { withTimezone: true }),
		deleteReason: varchar('delete_reason', { length: 500 }),
	},
	(table) => [
		index('otp_challenges_identity_created_idx').on(
			table.identityHash,
			table.createdAt,
		),
		index('otp_challenges_user_created_idx').on(table.userId, table.createdAt),
	],
);

export const userSessions = pgTable(
	'user_sessions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		refreshTokenHash: varchar('refresh_token_hash', { length: 128 }).notNull(),
		deviceLabel: varchar('device_label', { length: 100 }),
		deviceIdentifierHash: varchar('device_identifier_hash', { length: 64 }),
		deviceType: varchar('device_type', { length: 40 }),
		deviceVendor: varchar('device_vendor', { length: 80 }),
		deviceModel: varchar('device_model', { length: 120 }),
		browserName: varchar('browser_name', { length: 80 }),
		browserVersion: varchar('browser_version', { length: 40 }),
		osName: varchar('os_name', { length: 80 }),
		osVersion: varchar('os_version', { length: 40 }),
		activeContextType: sessionContextTypeEnum('active_context_type')
			.notNull()
			.default('personal'),
		activeOrganisationId: uuid('active_organisation_id'),
		tokenVersion: integer('token_version').notNull().default(1),
		ipAddress: varchar('ip_address', { length: 64 }),
		location: varchar('location', { length: 255 }),
		city: varchar('city', { length: 120 }),
		region: varchar('region', { length: 120 }),
		country: varchar('country', { length: 120 }),
		countryCode: varchar('country_code', { length: 8 }),
		timezone: varchar('timezone', { length: 80 }),
		latitude: varchar('latitude', { length: 32 }),
		longitude: varchar('longitude', { length: 32 }),
		networkAsn: varchar('network_asn', { length: 32 }),
		networkName: varchar('network_name', { length: 160 }),
		userAgent: varchar('user_agent', { length: 500 }),
		clientHints: jsonb('client_hints')
			.$type<Record<string, string>>()
			.notNull()
			.default({}),
		metadata: jsonb('metadata')
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		signedInAt: timestamp('signed_in_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		lastActiveAt: timestamp('last_active_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		revokedAt: timestamp('revoked_at', { withTimezone: true }),
		revokeReason: varchar('revoke_reason', { length: 500 }),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		deletedAt: timestamp('deleted_at', { withTimezone: true }),
		deleteReason: varchar('delete_reason', { length: 500 }),
	},
	(table) => [
		index('user_sessions_user_idx').on(table.userId),
		uniqueIndex('user_sessions_refresh_token_unique').on(
			table.refreshTokenHash,
		),
	],
);

export const authenticationEvents = pgTable(
	'authentication_events',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id').references(() => users.id, {
			onDelete: 'set null',
		}),
		challengeId: uuid('challenge_id').references(() => otpChallenges.id, {
			onDelete: 'set null',
		}),
		type: authenticationEventTypeEnum('type').notNull(),
		status: authenticationEventStatusEnum('status').notNull(),
		identityHash: varchar('identity_hash', { length: 64 }),
		reason: varchar('reason', { length: 500 }),
		ipAddress: varchar('ip_address', { length: 64 }),
		userAgent: varchar('user_agent', { length: 500 }),
		metadata: jsonb('metadata')
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		deletedAt: timestamp('deleted_at', { withTimezone: true }),
		deleteReason: varchar('delete_reason', { length: 500 }),
	},
	(table) => [
		index('authentication_events_user_created_idx').on(
			table.userId,
			table.createdAt,
		),
		index('authentication_events_identity_created_idx').on(
			table.identityHash,
			table.createdAt,
		),
	],
);

export const usersRelations = relations(users, ({ many }) => ({
	authenticationEvents: many(authenticationEvents),
	externalIdentities: many(externalIdentities),
	otpChallenges: many(otpChallenges),
	sessions: many(userSessions),
}));

export const externalIdentitiesRelations = relations(
	externalIdentities,
	({ one }) => ({
		user: one(users, {
			fields: [externalIdentities.userId],
			references: [users.id],
		}),
	}),
);

export const otpChallengesRelations = relations(
	otpChallenges,
	({ many, one }) => ({
		authenticationEvents: many(authenticationEvents),
		user: one(users, {
			fields: [otpChallenges.userId],
			references: [users.id],
		}),
	}),
);

export const userSessionsRelations = relations(userSessions, ({ one }) => ({
	user: one(users, { fields: [userSessions.userId], references: [users.id] }),
}));

export const authenticationEventsRelations = relations(
	authenticationEvents,
	({ one }) => ({
		challenge: one(otpChallenges, {
			fields: [authenticationEvents.challengeId],
			references: [otpChallenges.id],
		}),
		user: one(users, {
			fields: [authenticationEvents.userId],
			references: [users.id],
		}),
	}),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type OtpChallenge = typeof otpChallenges.$inferSelect;
export type UserSession = typeof userSessions.$inferSelect;

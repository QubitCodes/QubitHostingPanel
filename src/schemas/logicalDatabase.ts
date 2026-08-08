import { z } from 'zod';

import { DATABASE_IDENTIFIER_SUFFIX_MAX_LENGTH } from '@utils/databaseIdentifier';

export const logicalDatabasePublicIdSchema = z.uuid();
export const databaseNameSchema = z
	.string()
	.trim()
	.min(2)
	.max(DATABASE_IDENTIFIER_SUFFIX_MAX_LENGTH, `Database name suffix cannot exceed ${DATABASE_IDENTIFIER_SUFFIX_MAX_LENGTH} characters.`)
	.regex(
		/^[a-z0-9]+(?:_[a-z0-9]+)*$/,
		'Database name must use lowercase snake_case.',
	);

export const logicalDatabaseNameAvailabilitySchema = z
	.object({ name: databaseNameSchema })
	.strict();
export const databasePasswordSchema = z
	.string()
	.min(16, 'Database password must contain at least 16 characters.')
	.max(256, 'Database password cannot exceed 256 characters.')
	.regex(/[a-z]/, 'Database password must contain a lowercase letter.')
	.regex(/[A-Z]/, 'Database password must contain an uppercase letter.')
	.regex(/[0-9]/, 'Database password must contain a number.');
export const createLogicalDatabaseSchema = z.object({
	engine: z.enum(['postgresql', 'mysql']),
	name: databaseNameSchema,
	userMode: z.enum(['new', 'existing']).default('new'),
	username: databaseNameSchema.optional(),
	password: databasePasswordSchema.optional(),
	databaseUserId: z.uuid().optional(),
	connectionLimit: z.number().int().min(1).max(100).default(10),
	storageQuotaMb: z.number().int().min(128).max(102400).default(1024),
}).strict().superRefine((value, context) => {
	if (value.userMode === 'existing' && !value.databaseUserId) context.addIssue({ code: 'custom', message: 'Choose an existing database user.', path: ['databaseUserId'] });
	if (value.userMode === 'existing' && value.password) context.addIssue({ code: 'custom', message: 'An existing database user password cannot be supplied or changed here.', path: ['password'] });
});
export const logicalDatabaseUserQuerySchema = z.object({ engine: z.enum(['postgresql', 'mysql']).optional() }).strict();
export const rotateDatabaseCredentialSchema = z.object({ acceptedImpact: z.literal(true) }).strict();
export const deleteLogicalDatabaseSchema = z
	.object({
		acceptedImpact: z.boolean().default(false),
		confirmationName: z.string().trim().min(1).max(160),
		connectedApplicationNames: z
			.array(z.string().trim().min(1).max(160))
			.max(25)
			.default([]),
	})
	.strict();
export type CreateLogicalDatabaseRequest = z.infer<
	typeof createLogicalDatabaseSchema
>;
export type DeleteLogicalDatabaseRequest = z.infer<
	typeof deleteLogicalDatabaseSchema
>;

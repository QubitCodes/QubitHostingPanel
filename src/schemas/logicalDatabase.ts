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
export const cloneLogicalDatabaseSchema = z.object({
	name: databaseNameSchema,
	confirmationName: z.string().trim().min(1).max(160),
}).strict();
export const renameLogicalDatabaseSchema = z.object({
	name: databaseNameSchema,
	acceptedImpact: z.literal(true),
	confirmationName: z.string().trim().min(1).max(160),
	connectedApplicationNames: z.array(z.string().trim().min(1).max(160)).max(25).default([]),
}).strict();
export const moveLogicalDatabaseSchema = z.object({
	targetWorkspacePublicId: z.number().int().min(100000).max(999999),
	name: databaseNameSchema,
	acceptedImpact: z.literal(true),
	confirmationName: z.string().trim().min(1).max(160),
}).strict();

function ipVersion(address: string): 0 | 4 | 6 {
	const ipv4 = address.split('.');
	if (ipv4.length === 4 && ipv4.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)) return 4;
	if (!/^[0-9a-f:]+$/i.test(address) || address.includes(':::') || address.split('::').length > 2) return 0;
	const groups = address.split(':').filter(Boolean);
	if (!groups.every((group) => /^[0-9a-f]{1,4}$/i.test(group))) return 0;
	const compressed = address.includes('::');
	return (compressed ? groups.length < 8 : groups.length === 8) ? 6 : 0;
}

const cidrSchema = z.string().trim().max(64).refine((value) => {
	const [address, prefix, extra] = value.split('/');
	if (!address || extra !== undefined) return false;
	const version = ipVersion(address);
	if (!version) return false;
	if (prefix === undefined) return true;
	if (!/^\d{1,3}$/.test(prefix)) return false;
	const numericPrefix = Number(prefix);
	return numericPrefix >= (version === 4 ? 8 : 32) && numericPrefix <= (version === 4 ? 32 : 128);
}, 'Enter a valid IPv4 or IPv6 CIDR.');

export const databaseExternalAccessSchema = z.object({
	allowedCidrs: z.array(cidrSchema).min(1).max(32).transform((values) => [...new Set(values)]),
	expiresAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value)).refine((value) => value.getTime() > Date.now() + 60_000, 'Expiry must be in the future.').optional(),
}).strict();
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
export type CloneLogicalDatabaseRequest = z.infer<typeof cloneLogicalDatabaseSchema>;
export type RenameLogicalDatabaseRequest = z.infer<typeof renameLogicalDatabaseSchema>;
export type MoveLogicalDatabaseRequest = z.infer<typeof moveLogicalDatabaseSchema>;
export type DatabaseExternalAccessRequest = z.infer<typeof databaseExternalAccessSchema>;

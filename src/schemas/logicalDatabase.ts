import { z } from 'zod';

export const logicalDatabasePublicIdSchema = z.uuid();
const databaseNameSchema = z
	.string()
	.trim()
	.min(2)
	.max(63, 'Database name cannot exceed 63 characters.')
	.regex(
		/^[a-z0-9]+(?:_[a-z0-9]+)*$/,
		'Database name must use lowercase snake_case.',
	);

export const logicalDatabaseNameAvailabilitySchema = z
	.object({ name: databaseNameSchema })
	.strict();
export const createLogicalDatabaseSchema = z.object({
	engine: z.enum(['postgresql', 'mysql']),
	name: databaseNameSchema,
	connectionLimit: z.number().int().min(1).max(100).default(10),
	storageQuotaMb: z.number().int().min(128).max(102400).default(1024),
});
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

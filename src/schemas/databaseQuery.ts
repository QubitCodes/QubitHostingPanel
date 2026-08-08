import { z } from 'zod';

export const databaseQueryRequestSchema = z.object({
	query: z.string().trim().min(1).max(100_000),
	allowChanges: z.boolean(),
	confirmation: z.string().trim().max(255).optional(),
	rowLimit: z.number().int().min(1).max(500),
	savedQueryId: z.string().uuid().optional(),
}).strict();

export type DatabaseQueryRequest = z.infer<typeof databaseQueryRequestSchema>;

export const databaseQueryExportSchema = z.object({
	query: z.string().trim().min(1).max(100_000),
	rowLimit: z.number().int().min(1).max(10_000).default(1_000),
}).strict();

export const databaseSavedQueryCreateSchema = z.object({
	name: z.string().trim().min(1).max(120),
	description: z.string().trim().max(500).optional(),
	query: z.string().trim().min(1).max(100_000),
	allowChanges: z.boolean().default(false),
	rowLimit: z.number().int().min(1).max(500).default(100),
	isFavorite: z.boolean().default(false),
}).strict();

export const databaseSavedQueryUpdateSchema = z.object({
	name: z.string().trim().min(1).max(120).optional(),
	description: z.string().trim().max(500).optional(),
	query: z.string().trim().min(1).max(100_000).optional(),
	allowChanges: z.boolean().optional(),
	rowLimit: z.number().int().min(1).max(500).optional(),
	isFavorite: z.boolean().optional(),
}).strict().refine(
	(value) => Object.keys(value).length > 0,
	{ message: 'At least one saved-query field is required.' },
);

export const databaseSavedQueryIdSchema = z.string().uuid();

export type DatabaseQueryExport = z.infer<typeof databaseQueryExportSchema>;
export type DatabaseSavedQueryCreate = z.infer<typeof databaseSavedQueryCreateSchema>;
export type DatabaseSavedQueryUpdate = z.infer<typeof databaseSavedQueryUpdateSchema>;

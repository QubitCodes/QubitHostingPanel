import { z } from 'zod';

export const databaseQueryRequestSchema = z.object({
	query: z.string().trim().min(1).max(100_000),
	allowChanges: z.boolean(),
	confirmation: z.string().trim().max(255).optional(),
	rowLimit: z.number().int().min(1).max(500),
}).strict();

export type DatabaseQueryRequest = z.infer<typeof databaseQueryRequestSchema>;

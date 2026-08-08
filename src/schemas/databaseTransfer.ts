import { z } from 'zod';

export const databaseImportRequestSchema = z.object({
	confirmation: z.string().trim().min(1).max(255),
	mode: z.enum(['merge', 'replace']),
	uploadToken: z.string().trim().min(40).max(4096),
}).strict();

export type DatabaseImportRequest = z.infer<typeof databaseImportRequestSchema>;

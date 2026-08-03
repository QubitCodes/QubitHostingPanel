import { z } from 'zod';

export const logicalDatabasePublicIdSchema = z.uuid();
export const createLogicalDatabaseSchema = z.object({ engine: z.enum(['postgresql', 'mysql']), name: z.string().trim().min(2).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/), connectionLimit: z.number().int().min(1).max(100).default(10), storageQuotaMb: z.number().int().min(128).max(102400).default(1024) });
export type CreateLogicalDatabaseRequest = z.infer<typeof createLogicalDatabaseSchema>;

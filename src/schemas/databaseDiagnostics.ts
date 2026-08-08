import { z } from 'zod';

export const databaseDiagnosticsQuerySchema = z.object({
	slowThresholdSeconds: z.coerce.number().int().min(1).max(300).default(5),
}).strict();

export const cancelDatabaseSessionSchema = z.object({
	confirmation: z.string().trim().min(1).max(255),
	sessionId: z.string().regex(/^\d{1,20}$/, 'Invalid database session.'),
}).strict();

export type DatabaseDiagnosticsQuery = z.infer<typeof databaseDiagnosticsQuerySchema>;
export type CancelDatabaseSessionRequest = z.infer<typeof cancelDatabaseSessionSchema>;

import { z } from 'zod';

export const databaseExternalAccessAcknowledgementSchema = z.object({
	results: z.array(z.object({
		failureReason: z.string().trim().max(1000).optional(),
		revision: z.string().trim().min(1).max(64),
		ruleId: z.uuid(),
		success: z.boolean(),
	}).strict()).max(1000),
}).strict();

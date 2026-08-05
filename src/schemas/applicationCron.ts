import { z } from 'zod';

const fields = {
	name: z.string().trim().min(2).max(120).regex(/^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/),
	command: z.string().trim().max(1000).optional(),
	frequency: z.string().trim().min(5).max(100),
	timeoutSeconds: z.number().int().min(1).max(3600),
	isEnabled: z.boolean(),
};
export const createApplicationCronSchema = z.object(fields).strict();
export const updateApplicationCronSchema = z.object(fields).strict();
export type CreateApplicationCronRequest = z.infer<typeof createApplicationCronSchema>;

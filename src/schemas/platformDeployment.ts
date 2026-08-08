import { z } from 'zod';

export const createPlatformDeploymentSchema = z.object({
	confirmation: z
		.string()
		.refine((value): boolean => value === 'DEPLOY', 'Type DEPLOY exactly.'),
});

export const platformDeploymentIdSchema = z.uuid();

export type CreatePlatformDeploymentInput = z.infer<
	typeof createPlatformDeploymentSchema
>;

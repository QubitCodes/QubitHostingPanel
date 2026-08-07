import { z } from 'zod';

export const githubConnectionIdSchema = z.uuid();

export const deactivateGithubConnectionSchema = z.object({
	acceptedImpact: z.literal(true),
}).strict();

export type DeactivateGithubConnectionInput = z.infer<typeof deactivateGithubConnectionSchema>;

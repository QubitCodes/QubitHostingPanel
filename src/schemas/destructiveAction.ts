import { z } from 'zod';

/** Shared payload required by destructive API actions. */
export const destructiveActionSchema = z.object({ acceptedImpact: z.boolean().default(false), confirmationName: z.string().trim().min(1).max(255), connectedResourceNames: z.array(z.string().trim().min(1).max(255)).max(50).default([]) }).strict();
export type DestructiveActionRequest = z.infer<typeof destructiveActionSchema>;

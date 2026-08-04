import { z } from 'zod';

export const createProviderConnectionSchema = z.object({ apiToken: z.string().trim().min(16).max(2000), baseUrl: z.url().refine((value) => value.startsWith('https://'), 'HTTPS is required.'), code: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{2,119}$/), defaultEnvironmentName: z.string().trim().min(1).max(120).optional(), defaultProjectUuid: z.string().trim().max(120).optional(), destinationUuid: z.string().trim().max(120).optional(), isDefault: z.boolean().optional(), name: z.string().trim().min(2).max(160), serverUuid: z.string().trim().max(120).optional(), teamId: z.number().int().positive().optional(), wildcardDomain: z.string().trim().max(255).optional() }).strict();
export const rotateProviderTokenSchema = z.object({ apiToken: z.string().trim().min(16).max(2000) }).strict();
export type CreateProviderConnectionInput = z.infer<typeof createProviderConnectionSchema>;

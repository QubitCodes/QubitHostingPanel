import { z } from 'zod';

export const adminUserPublicIdSchema = z.coerce.number().int().min(100000).max(999999);
export const adminUserStatusSchema = z.object({ status: z.enum(['active', 'inactive', 'suspended']), reason: z.string().trim().min(5).max(500) }).strict();
export const adminSessionRevokeSchema = z.object({ reason: z.string().trim().min(5).max(500) }).strict();
export const adminApplicationFileReadSchema = z.object({ path: z.string().trim().min(1).max(1000).refine((value) => !value.startsWith('/') && !value.split('/').includes('..'), 'Path must remain inside the repository.'), reason: z.string().trim().min(5).max(500).optional() }).strict();
export const adminApplicationActionSchema = z.object({ action: z.enum(['start', 'stop', 'restart', 'redeploy']), reason: z.string().trim().min(5).max(500) }).strict();

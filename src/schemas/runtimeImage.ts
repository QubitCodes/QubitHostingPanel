import { z } from 'zod';

const fields = { code: z.string().trim().regex(/^[a-z0-9][a-z0-9._-]{2,79}$/), defaultPort: z.number().int().min(1).max(65535), digest: z.string().trim().max(255).nullable().optional(), isDefault: z.boolean(), language: z.enum(['static', 'php', 'node', 'python', 'ruby']), metadata: z.record(z.string(), z.unknown()).optional(), registry: z.string().trim().min(1).max(255), repository: z.string().trim().min(1).max(255), status: z.enum(['active', 'deprecated', 'disabled']), tag: z.string().trim().min(1).max(120), version: z.string().trim().min(1).max(40) };
export const createRuntimeImageSchema = z.object(fields).strict();
export const updateRuntimeImageSchema = z.object(fields).partial().strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one change.');
export const deleteRuntimeImageSchema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();
export type CreateRuntimeImageInput = z.infer<typeof createRuntimeImageSchema>;
export type UpdateRuntimeImageInput = z.infer<typeof updateRuntimeImageSchema>;

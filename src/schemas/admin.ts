import { z } from 'zod';

export const adminIdSchema = z.uuid();
export const createAdminSchema = z.object({
	countryCode: z.string().trim().regex(/^\+?\d{1,4}$/),
	displayName: z.string().trim().min(1).max(160),
	mobile: z.string().trim().regex(/^\d{4,20}$/),
	roleIds: z.array(z.uuid()).min(1).max(10)
}).strict();
export const updateAdminSchema = z.object({
	displayName: z.string().trim().min(1).max(160).optional(),
	status: z.enum(['active', 'inactive', 'suspended']).optional()
}).strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one change.');
export const replaceAdminRolesSchema = z.object({ roleIds: z.array(z.uuid()).min(1).max(10) }).strict();
export const deleteAdminSchema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();
export const permissionOverrideInputSchema = z.object({
	effect: z.enum(['allow', 'deny']),
	expiresAt: z.iso.datetime().nullable().optional(),
	permissionId: z.uuid(),
	reason: z.string().trim().min(3).max(500)
}).strict();
export const replaceAdminOverridesSchema = z.object({ overrides: z.array(permissionOverrideInputSchema).max(100) }).strict();

export type CreateAdminInput = z.infer<typeof createAdminSchema>;
export type UpdateAdminInput = z.infer<typeof updateAdminSchema>;
export type ReplaceAdminOverridesInput = z.infer<typeof replaceAdminOverridesSchema>;

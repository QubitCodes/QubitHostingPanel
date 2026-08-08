import { z } from 'zod';

import { databaseNameSchema, databasePasswordSchema } from '@schemas/logicalDatabase';

const scopeSchema = z.object({ schema: z.string().trim().min(1).max(128).refine((value) => value !== 'information_schema' && value !== 'pg_catalog' && !value.startsWith('pg_'), 'System schemas cannot be granted.'), table: z.string().trim().min(1).max(128).optional() }).strict();
export const databasePrivilegeSchema = z.enum(['select', 'insert', 'update', 'delete']);
const databaseGrantSettingsShape = {
	accessLevel: z.enum(['read_only', 'read_write', 'custom']),
	privileges: z.array(databasePrivilegeSchema).max(4),
	scopes: z.array(scopeSchema).max(100),
	expiresAt: z.iso.datetime().optional(),
};

/** Adds cross-field rules shared by create and update grant requests. */
function validateGrantSettings(value: { accessLevel: 'custom' | 'read_only' | 'read_write'; expiresAt?: string; privileges: string[]; scopes: unknown[] }, context: z.RefinementCtx): void {
	if (value.accessLevel === 'custom' && !value.privileges.length) context.addIssue({ code: 'custom', message: 'Choose at least one custom privilege.', path: ['privileges'] });
	if (value.accessLevel !== 'custom' && (value.privileges.length || value.scopes.length)) context.addIssue({ code: 'custom', message: 'Scopes and privileges are available only for custom access.', path: ['accessLevel'] });
	if (value.expiresAt && new Date(value.expiresAt).getTime() <= Date.now()) context.addIssue({ code: 'custom', message: 'Expiry must be in the future.', path: ['expiresAt'] });
}

export const createDatabaseAccessSchema = z.object({
	userMode: z.enum(['new', 'existing']),
	databaseUserId: z.uuid().optional(),
	username: databaseNameSchema.optional(),
	password: databasePasswordSchema.optional(),
	...databaseGrantSettingsShape,
}).strict().superRefine((value, context) => {
	if (value.userMode === 'new' && !value.username) context.addIssue({ code: 'custom', message: 'Enter a database username.', path: ['username'] });
	if (value.userMode === 'existing' && !value.databaseUserId) context.addIssue({ code: 'custom', message: 'Choose an existing database user.', path: ['databaseUserId'] });
	if (value.userMode === 'existing' && value.password) context.addIssue({ code: 'custom', message: 'Existing-user passwords cannot be changed here.', path: ['password'] });
	validateGrantSettings(value, context);
});

export const updateDatabaseGrantSchema = z.object(databaseGrantSettingsShape).strict().superRefine(validateGrantSettings);
export const revokeDatabaseGrantSchema = z.object({ reason: z.string().trim().min(3).max(500), confirmation: z.string().trim().min(1).max(120) }).strict();
export const databaseUserActionSchema = z.object({ action: z.enum(['reveal', 'rotate', 'suspend', 'restore', 'delete']), acceptedImpact: z.literal(true), confirmation: z.string().trim().min(1).max(120), password: databasePasswordSchema.optional(), reason: z.string().trim().min(3).max(500).optional() }).strict();

export type CreateDatabaseAccessRequest = z.infer<typeof createDatabaseAccessSchema>;
export type UpdateDatabaseGrantRequest = z.infer<typeof updateDatabaseGrantSchema>;
export type RevokeDatabaseGrantRequest = z.infer<typeof revokeDatabaseGrantSchema>;
export type DatabaseUserActionRequest = z.infer<typeof databaseUserActionSchema>;
export type DatabasePrivilege = z.infer<typeof databasePrivilegeSchema>;

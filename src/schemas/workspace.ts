import { z } from 'zod';

export const customerPublicIdSchema = z.number().int().min(100000).max(999999);
export const workspacePublicIdSchema = z.number().int().min(100000).max(999999);
export const workspaceSlugSchema = z.string().trim().min(2).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const updateWorkspaceCompatibilitySchema = z.object({
	autoCharsetFix: z.boolean(),
}).strict();

export const createWorkspaceSchema = z.object({
	name: z.string().trim().min(2).max(160),
	slug: workspaceSlugSchema,
	type: z.enum(['personal', 'organisation']).default('personal'),
	organisation: z.object({
		contactCountryCode: z.string().trim().regex(/^\+[1-9]\d{0,3}$/).nullable().optional(),
		contactEmail: z.email().max(320).nullable().optional(),
		contactMobile: z.string().trim().regex(/^\d{4,20}$/).nullable().optional(),
		displayName: z.string().trim().min(2).max(160),
		gstin: z.string().trim().toUpperCase().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/).nullable().optional(),
		legalName: z.string().trim().min(2).max(200).nullable().optional(),
	}).strict().nullable().default(null),
}).strict().superRefine((value, context) => {
	if (value.type === 'organisation' && value.organisation === null) context.addIssue({ code: 'custom', message: 'Organisation details are required.', path: ['organisation'] });
	if (value.type === 'personal' && value.organisation !== null) context.addIssue({ code: 'custom', message: 'Personal workspaces cannot include organisation details.', path: ['organisation'] });
	const organisation = value.organisation;
	if (organisation && Number(organisation.contactCountryCode != null) !== Number(organisation.contactMobile != null)) context.addIssue({ code: 'custom', message: 'Contact country code and mobile must be provided together.', path: ['organisation', 'contactMobile'] });
});

export const convertWorkspaceToOrganisationSchema = z.object({
	contactCountryCode: z.string().trim().regex(/^\+[1-9]\d{0,3}$/).nullable().optional(),
	contactEmail: z.email().max(320).nullable().optional(),
	contactMobile: z.string().trim().regex(/^\d{4,20}$/).nullable().optional(),
	displayName: z.string().trim().min(2).max(160),
	gstin: z.string().trim().toUpperCase().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/).nullable().optional(),
	legalName: z.string().trim().min(2).max(200).nullable().optional(),
}).strict().superRefine((value, context) => {
	if (Number(value.contactCountryCode != null) !== Number(value.contactMobile != null)) context.addIssue({ code: 'custom', message: 'Contact country code and mobile must be provided together.', path: ['contactMobile'] });
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type ConvertWorkspaceToOrganisationInput = z.infer<typeof convertWorkspaceToOrganisationSchema>;
export type UpdateWorkspaceCompatibilityInput = z.infer<typeof updateWorkspaceCompatibilitySchema>;

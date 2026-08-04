import { z } from 'zod';

export const convertWorkspaceSchema = z.object({ displayName: z.string().trim().min(2).max(160), legalName: z.string().trim().max(200).optional(), gstin: z.string().trim().toUpperCase().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/).optional() }).strict();
export const billingProfileValuesSchema = z.object({ displayName: z.string().trim().min(2).max(200), legalName: z.string().trim().max(200).optional(), contactEmail: z.email(), contactCountryCode: z.string().trim().regex(/^\+?[0-9]{1,4}$/).optional(), contactMobile: z.string().trim().regex(/^[0-9]{6,15}$/).optional(), gstin: z.string().trim().toUpperCase().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/).optional(), addressLine1: z.string().trim().min(3).max(255), addressLine2: z.string().trim().max(255).optional(), city: z.string().trim().min(2).max(120), region: z.string().trim().min(2).max(120), postalCode: z.string().trim().min(3).max(20), countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).default('IN') }).strict();
export const billingProfileSchema = z.union([billingProfileValuesSchema, z.object({ sourceProfileId: z.uuid() }).strict()]);
export const ownershipTransferSchema = z.object({ recipientUserPublicId: z.coerce.number().int().min(100000).max(999999), reason: z.string().trim().max(500).optional() }).strict();
export const ownershipTransferResponseSchema = z.object({ decision: z.enum(['accept', 'decline']) }).strict();
export const ownershipTransferPublicIdSchema = z.uuid();
export const subscriptionCancellationSchema = z.object({ cancelAtPeriodEnd: z.boolean(), reason: z.string().trim().max(500).optional() }).strict();

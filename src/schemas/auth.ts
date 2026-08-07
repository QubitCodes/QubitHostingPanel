import { z } from 'zod';

export const requestOtpSchema = z.object({
	countryCode: z.string().trim().regex(/^\+?\d{1,4}$/).optional(),
	mobile: z.string().trim().regex(/^(?:~~)?\d{4,20}$/, 'Enter a valid mobile number.')
}).strict();

export const resolveMobileCountrySchema = z.object({
	mobile: z.string().trim().regex(/^\d{8,15}$/, 'Enter a valid mobile number.')
}).strict();

export const verifyOtpSchema = z.object({
	challengeId: z.uuid(),
	otp: z.string().regex(/^\d{6}$/, 'OTP must contain exactly 6 digits.')
}).strict();
export const resendOtpSchema = z.object({ challengeId: z.uuid() }).strict();

export const refreshSessionSchema = z.object({ refreshToken: z.string().min(32) }).strict();
export const switchContextSchema = z.object({
	context: z.enum(['personal', 'admin']),
	organisationId: z.never().optional()
}).strict();

export const sessionIdSchema = z.uuid();
const databaseManagerPathSchema = z.string().regex(/^\/database\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:\/[a-z0-9_./%-]+)?$/i, 'Invalid database-manager path.').refine((value) => { try { return !decodeURIComponent(value).split('/').some((segment) => segment === '.' || segment === '..'); } catch { return false; } }, 'Invalid database-manager path.');
export const createAuthenticationHandoffSchema = z.object({ targetPath: z.union([z.enum(['/dashboard', '/admin/overview']), databaseManagerPathSchema]) }).strict();
export const consumeAuthenticationHandoffSchema = z.object({ token: z.string().min(32).max(200) }).strict();
export type CreateAuthenticationHandoffInput = z.infer<typeof createAuthenticationHandoffSchema>;
export type ConsumeAuthenticationHandoffInput = z.infer<typeof consumeAuthenticationHandoffSchema>;
export const updateSessionLabelSchema = z.object({
	label: z.string().trim().min(1).max(100)
}).strict();

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type ResendOtpInput = z.infer<typeof resendOtpSchema>;
export type ResolveMobileCountryInput = z.infer<typeof resolveMobileCountrySchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

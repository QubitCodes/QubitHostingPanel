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

export const refreshSessionSchema = z.object({ refreshToken: z.string().min(32) }).strict();
export const switchContextSchema = z.object({
	context: z.enum(['personal', 'admin']),
	organisationId: z.never().optional()
}).strict();

export const sessionIdSchema = z.uuid();
export const createAuthenticationHandoffSchema = z.object({ targetPath: z.enum(['/dashboard', '/admin/overview']) }).strict();
export const consumeAuthenticationHandoffSchema = z.object({ token: z.string().min(32).max(200) }).strict();
export type CreateAuthenticationHandoffInput = z.infer<typeof createAuthenticationHandoffSchema>;
export type ConsumeAuthenticationHandoffInput = z.infer<typeof consumeAuthenticationHandoffSchema>;
export const updateSessionLabelSchema = z.object({
	label: z.string().trim().min(1).max(100)
}).strict();

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type ResolveMobileCountryInput = z.infer<typeof resolveMobileCountrySchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

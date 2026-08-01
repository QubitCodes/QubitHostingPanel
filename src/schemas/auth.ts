import { z } from 'zod';

export const requestOtpSchema = z.object({
	localMobileNumber: z.string().trim().regex(/^\d{4,20}$/, 'Enter a valid local mobile number.')
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

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;


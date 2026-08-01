import { describe, expect, it } from 'vitest';

import { requestOtpSchema, switchContextSchema, verifyOtpSchema } from '@schemas/auth';
import { createOtpSalt, generateOtp, hashOtp, verifyOtpHash } from '@services/auth/otpCryptoService';

describe('WhatsApp OTP security primitives', () => {
	it('generates six digit OTPs and verifies only the correct value', () => {
		const otp = generateOtp();
		const salt = createOtpSalt();
		const secret = 'a-secure-test-secret-with-at-least-32-characters';
		const hash = hashOtp(otp, salt, secret);
		expect(otp).toMatch(/^\d{6}$/);
		expect(verifyOtpHash(otp, salt, hash, secret)).toBe(true);
		expect(verifyOtpHash(otp === '000000' ? '000001' : '000000', salt, hash, secret)).toBe(false);
	});

	it('strictly validates OTP request, verification, and supported contexts', () => {
		expect(requestOtpSchema.safeParse({ localMobileNumber: '9876543210' }).success).toBe(true);
		expect(requestOtpSchema.safeParse({ localMobileNumber: '+919876543210' }).success).toBe(false);
		expect(verifyOtpSchema.safeParse({ challengeId: crypto.randomUUID(), otp: '123456' }).success).toBe(true);
		expect(verifyOtpSchema.safeParse({ challengeId: crypto.randomUUID(), otp: '12345' }).success).toBe(false);
		expect(switchContextSchema.safeParse({ context: 'organisation' }).success).toBe(false);
	});
});


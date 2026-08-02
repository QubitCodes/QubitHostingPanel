import { describe, expect, it } from 'vitest';

import { requestOtpSchema, switchContextSchema, verifyOtpSchema } from '@schemas/auth';
import { createMsg91Client } from '@qubitcodes/msg91';

import { createOtpSalt, hashOtp, verifyOtpHash } from '@services/auth/otpCryptoService';

describe('WhatsApp OTP security primitives', () => {
	it('uses the MSG91 default generator and verifies only the correct value', () => {
		const otp = createMsg91Client({ authKey: 'test', configFile: false }).whatsapp.otp.generate();
		const salt = createOtpSalt();
		const secret = 'a-secure-test-secret-with-at-least-32-characters';
		const hash = hashOtp(otp, salt, secret);
		expect(otp).toMatch(/^\d{6}$/);
		expect(verifyOtpHash(otp, salt, hash, secret)).toBe(true);
		expect(verifyOtpHash(otp === '000000' ? '000001' : '000000', salt, hash, secret)).toBe(false);
	});

	it('strictly validates OTP request, verification, and supported contexts', () => {
		expect(requestOtpSchema.safeParse({ mobile: '9876543210' }).success).toBe(true);
		expect(requestOtpSchema.safeParse({ countryCode: '+91', mobile: '9876543210' }).success).toBe(true);
		expect(requestOtpSchema.safeParse({ mobile: '+919876543210' }).success).toBe(false);
		expect(requestOtpSchema.safeParse({ countryCode: '+91', mobile: '~~9876543210' }).success).toBe(true);
		expect(requestOtpSchema.safeParse({ mobile: '9~~876543210' }).success).toBe(false);
		expect(requestOtpSchema.safeParse({ mobile: '~9876543210' }).success).toBe(false);
		expect(verifyOtpSchema.safeParse({ challengeId: crypto.randomUUID(), otp: '123456' }).success).toBe(true);
		expect(verifyOtpSchema.safeParse({ challengeId: crypto.randomUUID(), otp: '12345' }).success).toBe(false);
		expect(switchContextSchema.safeParse({ context: 'organisation' }).success).toBe(false);
	});
});

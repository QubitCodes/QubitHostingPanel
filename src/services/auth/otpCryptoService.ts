import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function createOtpSalt(): string {
	return randomBytes(24).toString('hex');
}

export function hashOtp(otp: string, salt: string, secret: string): string {
	return createHmac('sha256', secret).update(`${salt}:${otp}`).digest('hex');
}

export function verifyOtpHash(otp: string, salt: string, expectedHash: string, secret: string): boolean {
	const actual = Buffer.from(hashOtp(otp, salt, secret), 'hex');
	const expected = Buffer.from(expectedHash, 'hex');
	return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function hashSensitiveValue(value: string, secret: string): string {
	return createHmac('sha256', secret).update(value).digest('hex');
}

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { consumeAuthenticationHandoffSchema, createAuthenticationHandoffSchema } from '@schemas/auth';

describe('separate panel authentication handoff', () => {
	it('limits handoffs to known dashboard destinations', () => {
		expect(createAuthenticationHandoffSchema.safeParse({ targetPath: '/dashboard' }).success).toBe(true);
		expect(createAuthenticationHandoffSchema.safeParse({ targetPath: 'https://evil.example' }).success).toBe(false);
		expect(consumeAuthenticationHandoffSchema.safeParse({ token: 'a'.repeat(64) }).success).toBe(true);
	});

	it('atomically consumes an origin-bound unexpired token', () => {
		const source = readFileSync('src/controllers/AuthController.ts', 'utf8');
		expect(source).toContain('eq(authenticationHandoffs.targetOrigin, requestOrigin)');
		expect(source).toContain('isNull(authenticationHandoffs.consumedAt)');
		expect(source).toContain('gt(authenticationHandoffs.expiresAt, new Date())');
	});
});

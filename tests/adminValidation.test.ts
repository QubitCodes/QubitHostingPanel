import { describe, expect, it } from 'vitest';

import {
	adminIdSchema,
	createAdminSchema,
	deleteAdminSchema,
	replaceAdminOverridesSchema,
	updateAdminSchema,
} from '@schemas/admin';

describe('admin management validation', () => {
	it('accepts only six-digit public administrator IDs', () => {
		expect(adminIdSchema.safeParse('123456').data).toBe(123456);
		expect(adminIdSchema.safeParse('99999').success).toBe(false);
		expect(adminIdSchema.safeParse('1000000').success).toBe(false);
		expect(adminIdSchema.safeParse(crypto.randomUUID()).success).toBe(false);
	});

	it('accepts a strict passwordless administrator payload', () => {
		expect(
			createAdminSchema.safeParse({
				countryCode: '+91',
				displayName: 'Support Admin',
				mobile: '9876543210',
				roleIds: [crypto.randomUUID()],
			}).success,
		).toBe(true);
		expect(
			createAdminSchema.safeParse({
				countryCode: '+91',
				displayName: 'Support Admin',
				mobile: '9876543210',
				roleIds: [crypto.randomUUID()],
				password: 'prohibited',
			}).success,
		).toBe(false);
	});

	it('requires meaningful updates, delete reasons, and override reasons', () => {
		expect(updateAdminSchema.safeParse({}).success).toBe(false);
		expect(updateAdminSchema.safeParse({ status: 'suspended' }).success).toBe(
			true,
		);
		expect(deleteAdminSchema.safeParse({ reason: 'x' }).success).toBe(false);
		expect(
			replaceAdminOverridesSchema.safeParse({
				overrides: [
					{
						effect: 'deny',
						permissionId: crypto.randomUUID(),
						reason: 'Temporary access restriction',
					},
				],
			}).success,
		).toBe(true);
	});
});

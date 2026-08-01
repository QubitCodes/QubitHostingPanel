import { describe, expect, it } from 'vitest';

import { createAdminSchema, deleteAdminSchema, replaceAdminOverridesSchema, updateAdminSchema } from '@schemas/admin';

describe('admin management validation', () => {
	it('accepts a strict passwordless administrator payload', () => {
		expect(createAdminSchema.safeParse({ countryCallingCode: '+91', displayName: 'Support Admin', localMobileNumber: '9876543210', roleIds: [crypto.randomUUID()] }).success).toBe(true);
		expect(createAdminSchema.safeParse({ countryCallingCode: '+91', displayName: 'Support Admin', localMobileNumber: '9876543210', roleIds: [crypto.randomUUID()], password: 'prohibited' }).success).toBe(false);
	});

	it('requires meaningful updates, delete reasons, and override reasons', () => {
		expect(updateAdminSchema.safeParse({}).success).toBe(false);
		expect(updateAdminSchema.safeParse({ status: 'suspended' }).success).toBe(true);
		expect(deleteAdminSchema.safeParse({ reason: 'x' }).success).toBe(false);
		expect(replaceAdminOverridesSchema.safeParse({ overrides: [{ effect: 'deny', permissionId: crypto.randomUUID(), reason: 'Temporary access restriction' }] }).success).toBe(true);
	});
});

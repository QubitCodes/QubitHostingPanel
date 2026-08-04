import { describe, expect, it } from 'vitest';

import { revokeUsageOverrideSchema, usageObservationSchema, usageOverrideSchema } from '@schemas/usage';

describe('usage validation', () => {
	it('requires exactly one override value unless unlimited', () => {
		expect(usageOverrideSchema.safeParse({ entitlementCode: 'applications.count', numericValue: 3, isUnlimited: false, reason: 'Temporary capacity increase.' }).success).toBe(true);
		expect(usageOverrideSchema.safeParse({ entitlementCode: 'applications.count', numericValue: 3, booleanValue: true, isUnlimited: false, reason: 'Invalid dual value.' }).success).toBe(false);
		expect(usageOverrideSchema.safeParse({ entitlementCode: 'applications.count', isUnlimited: true, reason: 'Approved unlimited workspace.' }).success).toBe(true);
	});

	it('validates observation periods and freshness', () => {
		const observedAt = '2026-08-04T00:00:00.000Z';
		expect(usageObservationSchema.safeParse({ entitlementCode: 'storage.bytes', value: 100, source: 'coolify', observedAt, staleAfter: '2026-08-04T01:00:00.000Z' }).success).toBe(true);
		expect(usageObservationSchema.safeParse({ entitlementCode: 'storage.bytes', value: 100, source: 'coolify', observedAt, staleAfter: '2026-08-03T23:00:00.000Z' }).success).toBe(false);
	});

	it('requires meaningful override revocation reasons', () => {
		expect(revokeUsageOverrideSchema.safeParse({ reason: 'No longer required.' }).success).toBe(true);
		expect(revokeUsageOverrideSchema.safeParse({ reason: '' }).success).toBe(false);
	});
});

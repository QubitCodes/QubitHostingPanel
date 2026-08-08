import { describe, expect, it } from 'vitest';

import { mergeMissingEntitlements } from '@services/subscriptions/subscriptionEntitlementBackfillService';

describe('subscription entitlement feature rollout', () => {
	it('appends an approved missing entitlement without changing purchased values', () => {
		const original = [{ code: 'applications.count', numericValue: 2 }];
		const result = mergeMissingEntitlements(original, [
			{ booleanValue: true, code: 'applications.custom_system_pages' },
		]);

		expect(result.addedCodes).toEqual(['applications.custom_system_pages']);
		expect(result.snapshot).toEqual([
			{ code: 'applications.count', numericValue: 2 },
			{ booleanValue: true, code: 'applications.custom_system_pages' },
		]);
		expect(original).toEqual([{ code: 'applications.count', numericValue: 2 }]);
	});

	it('is idempotent and never overwrites an existing purchased value', () => {
		const original = [
			{ booleanValue: false, code: 'applications.custom_system_pages' },
		];
		const result = mergeMissingEntitlements(original, [
			{ booleanValue: true, code: 'applications.custom_system_pages' },
		]);

		expect(result.addedCodes).toEqual([]);
		expect(result.snapshot).toEqual(original);
	});
});

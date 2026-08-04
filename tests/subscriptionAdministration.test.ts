import { describe, expect, it } from 'vitest';

import { subscriptionAddOnCancellationSchema, subscriptionAddOnSchema, subscriptionLifecycleSchema } from '@schemas/subscriptionAdministration';

describe('subscription administration validation', () => {
	it('accepts explicit lifecycle states and rejects undeclared input', () => {
		expect(subscriptionLifecycleSchema.safeParse({ status: 'cancelled', reason: 'Requested by customer.' }).success).toBe(true);
		expect(subscriptionLifecycleSchema.safeParse({ status: 'paused' }).success).toBe(false);
		expect(subscriptionLifecycleSchema.safeParse({ status: 'active', force: true }).success).toBe(false);
	});

	it('validates immutable add-on commercial values', () => {
		const item = { code: 'ses.recipients.1000', name: 'SES 1,000 recipients', quantity: 1, unitAmountMinor: 49900, currency: 'INR', entitlementSnapshot: [{ code: 'ses_recipients', numericValue: 1000 }] };
		expect(subscriptionAddOnSchema.safeParse(item).success).toBe(true);
		expect(subscriptionAddOnSchema.safeParse({ ...item, quantity: 0 }).success).toBe(false);
		expect(subscriptionAddOnSchema.safeParse({ ...item, unitAmountMinor: -1 }).success).toBe(false);
	});

	it('requires an audited add-on cancellation reason', () => {
		expect(subscriptionAddOnCancellationSchema.safeParse({ reason: 'Customer requested cancellation.' }).success).toBe(true);
		expect(subscriptionAddOnCancellationSchema.safeParse({ reason: '' }).success).toBe(false);
	});
});

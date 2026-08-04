import { describe, expect, it } from 'vitest';

import { billingProfileSchema, convertWorkspaceSchema, ownershipTransferResponseSchema, ownershipTransferSchema, subscriptionCancellationSchema } from '@schemas/workspaceLifecycle';

const billingProfile = { displayName: 'Qubit Codes', contactEmail: 'billing@example.com', addressLine1: '42 Green Road', city: 'Kolkata', region: 'West Bengal', postalCode: '700001', countryCode: 'IN' };

describe('workspace lifecycle validation', () => {
	it('validates conversion and rejects undeclared fields', () => {
		expect(convertWorkspaceSchema.safeParse({ displayName: 'Qubit Codes' }).success).toBe(true);
		expect(convertWorkspaceSchema.safeParse({ displayName: 'Qubit Codes', type: 'personal' }).success).toBe(false);
	});

	it('validates immutable billing profiles and clone identifiers', () => {
		expect(billingProfileSchema.safeParse(billingProfile).success).toBe(true);
		expect(billingProfileSchema.safeParse({ ...billingProfile, sourceProfileId: 'bad' }).success).toBe(false);
	});

	it('requires a six digit transfer recipient and explicit response', () => {
		expect(ownershipTransferSchema.safeParse({ recipientUserPublicId: 123456 }).success).toBe(true);
		expect(ownershipTransferSchema.safeParse({ recipientUserPublicId: 12345 }).success).toBe(false);
		expect(ownershipTransferResponseSchema.safeParse({ decision: 'accept' }).success).toBe(true);
		expect(ownershipTransferResponseSchema.safeParse({ decision: 'cancel' }).success).toBe(false);
	});

	it('validates reversible end-of-term cancellation', () => {
		expect(subscriptionCancellationSchema.safeParse({ cancelAtPeriodEnd: true, reason: 'Moving later' }).success).toBe(true);
		expect(subscriptionCancellationSchema.safeParse({ cancelAtPeriodEnd: false, extra: true }).success).toBe(false);
	});
});

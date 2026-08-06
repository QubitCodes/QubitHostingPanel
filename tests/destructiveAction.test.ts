import { describe, expect, it } from 'vitest';

import { destructiveActionSchema } from '@schemas/destructiveAction';
import { deleteLogicalDatabaseSchema } from '@schemas/logicalDatabase';

describe('destructive action validation', () => {
	it('requires the exact resource confirmation name', () => {
		expect(destructiveActionSchema.safeParse({ confirmationName: '' }).success).toBe(false);
		expect(destructiveActionSchema.safeParse({ confirmationName: 'production-cron' }).success).toBe(true);
	});

	it('accepts database dependency confirmations without unknown fields', () => {
		const result = deleteLogicalDatabaseSchema.safeParse({ acceptedImpact: true, confirmationName: 'q_100001_abc123', connectedApplicationNames: ['Storefront'] });
		expect(result.success).toBe(true);
		expect(deleteLogicalDatabaseSchema.safeParse({ confirmationName: 'db', unexpected: true }).success).toBe(false);
	});
});

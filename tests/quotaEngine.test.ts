import { describe, expect, it } from 'vitest';

import { evaluateQuota } from '@services/usage/quotaEngine';

describe('quota engine', () => {
	it('blocks a hard limit using current and pending usage', () => {
		expect(evaluateQuota({ code: 'applications.count', current: 1, pending: 1, quantity: 1, limit: 2, mode: 'hard' })).toMatchObject({ allowed: false, projected: 3, warning: true });
	});

	it('allows soft and metered overage while returning a warning', () => {
		expect(evaluateQuota({ code: 'storage.bytes', current: 90, pending: 0, quantity: 20, limit: 100, mode: 'soft' })).toMatchObject({ allowed: true, warning: true });
		expect(evaluateQuota({ code: 'email.recipients', current: 1000, pending: 0, quantity: 1, limit: 1000, mode: 'metered' })).toMatchObject({ allowed: true, warning: true });
	});

	it('never blocks unlimited policies', () => {
		expect(evaluateQuota({ code: 'databases.count', current: 999, pending: 99, quantity: 1, limit: 1, mode: 'hard', unlimited: true })).toMatchObject({ allowed: true, limit: null, warning: false });
	});
});

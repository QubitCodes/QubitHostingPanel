import { describe, expect, it } from 'vitest';

import { operationsReadinessRequiresAction } from '@services/operations/operationsReadinessService';

describe('operations readiness reporting', () => {
	it('ignores the generated timestamp and reports a clean operational snapshot', () => {
		expect(
			operationsReadinessRequiresAction({
				failedJobs: 0,
				generatedAt: '2026-08-08T00:00:00.000Z',
				latestReconciliationFailures: 0,
				stalePayments: 0,
				staleUsage: 0,
				unhealthyProviders: 0,
			}),
		).toBe(false);
	});

	it('marks any non-zero operational counter as actionable', () => {
		expect(
			operationsReadinessRequiresAction({
				failedJobs: 1,
				generatedAt: '2026-08-08T00:00:00.000Z',
				latestReconciliationFailures: 0,
				stalePayments: 0,
				staleUsage: 0,
				unhealthyProviders: 0,
			}),
		).toBe(true);
	});
});

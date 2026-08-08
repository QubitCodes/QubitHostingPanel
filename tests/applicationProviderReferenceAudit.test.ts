import { describe, expect, it } from 'vitest';

import { classifyApplicationProviderReferences } from '@services/applications/applicationProviderReferenceAuditService';

describe('application provider reference auditing', () => {
	it('distinguishes present and confirmed-missing provider references', () => {
		const report = classifyApplicationProviderReferences(
			[
				{
					applicationId: '11111111-1111-4111-8111-111111111111',
					framework: 'laravel',
					providerApplicationId: 'provider-present',
					resourceStatus: 'running',
					workspaceResourceId: '22222222-2222-4222-8222-222222222222',
				},
				{
					applicationId: '33333333-3333-4333-8333-333333333333',
					framework: 'nextjs',
					providerApplicationId: 'provider-missing',
					resourceStatus: 'unknown',
					workspaceResourceId: '44444444-4444-4444-8444-444444444444',
				},
			],
			[
				{
					id: 'provider-present',
					kind: 'application',
					name: 'Present',
					status: 'running:healthy',
				},
			],
		);
		expect(report.present).toBe(1);
		expect(report.confirmedMissing).toBe(1);
		expect(report.records[1]?.classification).toBe('confirmed_missing');
	});
});

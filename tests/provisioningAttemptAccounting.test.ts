import { describe, expect, it } from 'vitest';

import {
	isProviderReconciliationPoll,
	nextProvisioningAttemptCount,
} from '@services/provisioning/provisioningService';

describe('provisioning attempt accounting', () => {
	it('counts a provider submission as an attempt', () => {
		expect(nextProvisioningAttemptCount(2, {})).toBe(3);
	});

	it('does not consume attempts while polling an accepted provider resource', () => {
		const result = { providerResourceId: 'coolify-app-uuid' };

		expect(isProviderReconciliationPoll(result)).toBe(true);
		expect(nextProvisioningAttemptCount(5, result)).toBe(5);
	});

	it('does not treat an empty provider resource id as accepted', () => {
		expect(isProviderReconciliationPoll({ providerResourceId: '  ' })).toBe(false);
	});
});

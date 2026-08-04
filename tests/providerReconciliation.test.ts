import { describe, expect, it } from 'vitest';
import { sanitizeProviderSnapshot } from '@services/hosting/providerReconciliationService';

describe('sanitizeProviderSnapshot', () => {
	it('recursively removes credential-like fields while preserving operational state', () => {
		expect(sanitizeProviderSnapshot({ name: 'app', nested: { api_token: 'secret', status: 'running' }, password: 'hidden', values: [{ privateKey: 'hidden', uuid: 'one' }] })).toEqual({ name: 'app', nested: { status: 'running' }, values: [{ uuid: 'one' }] });
	});
});

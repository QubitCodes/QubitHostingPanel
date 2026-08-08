import { describe, expect, it } from 'vitest';
import { providerWorkspaceResourceStatus, sanitizeProviderSnapshot } from '@services/hosting/providerReconciliationService';

describe('sanitizeProviderSnapshot', () => {
	it('recursively removes credential-like fields while preserving operational state', () => {
		expect(sanitizeProviderSnapshot({ name: 'app', nested: { api_token: 'secret', status: 'running' }, password: 'hidden', values: [{ privateKey: 'hidden', uuid: 'one' }] })).toEqual({ name: 'app', nested: { status: 'running' }, values: [{ uuid: 'one' }] });
	});
});

describe('providerWorkspaceResourceStatus', () => {
	it('prioritizes unhealthy compound states over their running prefix', () => {
		expect(providerWorkspaceResourceStatus('running:unhealthy')).toBe('failed');
		expect(providerWorkspaceResourceStatus('running:healthy')).toBe('running');
		expect(providerWorkspaceResourceStatus('running:starting')).toBe('provisioning');
		expect(providerWorkspaceResourceStatus('exited')).toBe('stopped');
	});
});

import { describe, expect, it } from 'vitest';

import { isCoolifyEnvironmentConflict, normalizeCoolifyWildcardDomain, reusableCoolifyApplication, shouldRedeployCoolifyApplication } from '@services/hosting/CoolifyHostingProvider';

describe('normalizeCoolifyWildcardDomain', () => {
	it.each([
		['https://apps-staging.ghostdeploy.com', 'apps-staging.ghostdeploy.com'],
		['http://*.apps-staging.ghostdeploy.com/', 'apps-staging.ghostdeploy.com'],
		['*.apps-staging.ghostdeploy.com', 'apps-staging.ghostdeploy.com']
	])('normalizes %s', (input, expected) => {
		expect(normalizeCoolifyWildcardDomain(input)).toBe(expected);
	});
});

describe('reusableCoolifyApplication', () => {
	it('recovers an exact partial-create match without selecting a similarly named app', () => {
		expect(reusableCoolifyApplication([{ uuid: 'one', name: 'workspace-app' }, { uuid: 'two', name: 'workspace-app-copy' }], 'workspace-app')?.uuid).toBe('one');
	});
});

describe('isCoolifyEnvironmentConflict', () => {
	it('recognizes the duplicate variable response used for POST-to-PATCH fallback', () => {
		expect(isCoolifyEnvironmentConflict(new Error('Coolify 409: Environment variable already exists. Use PATCH request to update it.'))).toBe(true);
		expect(isCoolifyEnvironmentConflict(new Error('Coolify 500: request failed'))).toBe(false);
	});
});

describe('shouldRedeployCoolifyApplication', () => {
	it('restarts terminal failures without duplicating an active deployment', () => {
		expect(shouldRedeployCoolifyApplication('exited:unhealthy')).toBe(true);
		expect(shouldRedeployCoolifyApplication('running:healthy')).toBe(false);
		expect(shouldRedeployCoolifyApplication('building')).toBe(false);
	});
});

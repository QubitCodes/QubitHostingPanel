import { describe, expect, it } from 'vitest';

import { normalizeCoolifyWildcardDomain, reusableCoolifyApplication } from '@services/hosting/CoolifyHostingProvider';

describe('normalizeCoolifyWildcardDomain', () => {
	it.each([
		['https://apps-staging.qubit.codes', 'apps-staging.qubit.codes'],
		['http://*.apps-staging.qubit.codes/', 'apps-staging.qubit.codes'],
		['*.apps-staging.qubit.codes', 'apps-staging.qubit.codes']
	])('normalizes %s', (input, expected) => {
		expect(normalizeCoolifyWildcardDomain(input)).toBe(expected);
	});
});

describe('reusableCoolifyApplication', () => {
	it('recovers an exact partial-create match without selecting a similarly named app', () => {
		expect(reusableCoolifyApplication([{ uuid: 'one', name: 'workspace-app' }, { uuid: 'two', name: 'workspace-app-copy' }], 'workspace-app')?.uuid).toBe('one');
	});
});

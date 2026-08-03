import { describe, expect, it } from 'vitest';

import { normalizeCoolifyWildcardDomain } from '@services/hosting/CoolifyHostingProvider';

describe('normalizeCoolifyWildcardDomain', () => {
	it.each([
		['https://apps-staging.qubit.codes', 'apps-staging.qubit.codes'],
		['http://*.apps-staging.qubit.codes/', 'apps-staging.qubit.codes'],
		['*.apps-staging.qubit.codes', 'apps-staging.qubit.codes']
	])('normalizes %s', (input, expected) => {
		expect(normalizeCoolifyWildcardDomain(input)).toBe(expected);
	});
});

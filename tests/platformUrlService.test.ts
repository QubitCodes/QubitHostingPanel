import { describe, expect, it } from 'vitest';

import { normalizeApplicationBaseDomain } from '@services/platformUrlService';

describe('normalizeApplicationBaseDomain', () => {
	it('removes URL and wildcard syntax before composing application hostnames', () => {
		expect(
			normalizeApplicationBaseDomain(
				'https://apps-staging.ghostdeploy.com',
				'ghostdeploy.com',
			),
		).toBe('apps-staging.ghostdeploy.com');
		expect(
			normalizeApplicationBaseDomain(
				'*.apps.ghostdeploy.com',
				'ghostdeploy.com',
			),
		).toBe('apps.ghostdeploy.com');
	});

	it('falls back safely when configuration is invalid', () => {
		expect(
			normalizeApplicationBaseDomain('not a valid host/', 'ghostdeploy.com'),
		).toBe('ghostdeploy.com');
	});
});

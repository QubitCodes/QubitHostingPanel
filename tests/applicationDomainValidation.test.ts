import { describe, expect, it } from 'vitest';

import { createApplicationDomainSchema, createApplicationSchema, updateApplicationDomainSchema } from '@schemas/application';

describe('application domain validation', () => {
	it('accepts a customer-selected platform subdomain slug', () => {
		const result = createApplicationSchema.safeParse({ name: 'Customer API', subdomain: 'customer-api', runtimeCode: 'node-24', repository: 'https://github.com/qubit/example', branch: 'main', buildPack: 'nixpacks', baseDirectory: '/', port: 3000, databases: [] });
		expect(result.success).toBe(true);
	});

	it('rejects invalid custom hostnames and domain actions', () => {
		expect(createApplicationDomainSchema.safeParse({ hostname: 'https://example.com/path' }).success).toBe(false);
		expect(updateApplicationDomainSchema.safeParse({ action: 'toggle_platform', enabled: false }).success).toBe(true);
		expect(updateApplicationDomainSchema.safeParse({ action: 'delete' }).success).toBe(false);
	});
});

import { describe, expect, it } from 'vitest';

import { checkApplicationDomainSchema, createApplicationDomainSchema, createApplicationSchema, updateApplicationDomainSchema, updateApplicationSchema } from '@schemas/application';

describe('application domain validation', () => {
	it('accepts a customer-selected platform subdomain slug', () => {
		const result = createApplicationSchema.safeParse({ name: 'Customer API', subdomain: 'customer-api', domains: ['api.example.com', 'www.example.com'], runtimeCode: 'node-24', repository: 'https://github.com/qubit/example', branch: 'main', buildPack: 'nixpacks', baseDirectory: '/', port: 3000, databases: [] });
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.domains).toEqual(['api.example.com', 'www.example.com']);
	});

	it('rejects invalid custom hostnames and domain actions', () => {
		expect(createApplicationDomainSchema.safeParse({ hostname: 'https://example.com/path' }).success).toBe(false);
		expect(checkApplicationDomainSchema.safeParse({ hostname: 'api.example.com' }).success).toBe(true);
		expect(createApplicationSchema.safeParse({ name: 'API', domains: ['valid.example.com', 'not a domain'], runtimeCode: 'node-24', repository: 'https://github.com/qubit/example', port: 3000 }).success).toBe(false);
		expect(updateApplicationDomainSchema.safeParse({ action: 'toggle_platform', enabled: false }).success).toBe(true);
		expect(updateApplicationDomainSchema.safeParse({ action: 'refresh_tls' }).success).toBe(true);
		expect(updateApplicationDomainSchema.safeParse({ action: 'delete' }).success).toBe(false);
	});

	it('validates application deployment edits', () => {
		expect(updateApplicationSchema.safeParse({ branch: 'main', baseDirectory: '/', port: 3000 }).success).toBe(true);
		expect(updateApplicationSchema.safeParse({ branch: 'main', baseDirectory: '../private', port: 70000 }).success).toBe(false);
	});
});

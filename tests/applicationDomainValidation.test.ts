import { describe, expect, it } from 'vitest';

import { checkApplicationDomainSchema, createApplicationDomainSchema, createApplicationSchema, domainAccessActionSchema, registerDomainOwnershipSchema, updateApplicationDomainSchema, updateApplicationSchema } from '@schemas/application';

describe('application domain validation', () => {
	it('accepts a customer-selected platform subdomain slug', () => {
		const result = createApplicationSchema.safeParse({ name: 'Customer API', subdomain: 'customer-api', domains: ['api.example.com', 'www.example.com'], runtimeCode: 'node-24', repository: 'https://github.com/qubit/example', branch: 'main', buildPack: 'nixpacks', baseDirectory: '/', port: 3000, databases: [] });
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.domains).toEqual(['api.example.com', 'www.example.com']);
	});

	it('rejects invalid custom hostnames and domain actions', () => {
		expect(createApplicationDomainSchema.safeParse({ hostname: 'https://example.com/path' }).success).toBe(false);
		expect(checkApplicationDomainSchema.safeParse({ hostname: 'api.example.com' }).success).toBe(true);
		expect(checkApplicationDomainSchema.parse({ hostname: 'api.example.com' }).purpose).toBe('attach');
		expect(checkApplicationDomainSchema.safeParse({ hostname: 'example.com', purpose: 'ownership' }).success).toBe(true);
		expect(createApplicationSchema.safeParse({ name: 'API', domains: ['valid.example.com', 'not a domain'], runtimeCode: 'node-24', repository: 'https://github.com/qubit/example', port: 3000 }).success).toBe(false);
		expect(updateApplicationDomainSchema.safeParse({ action: 'toggle_platform', enabled: false }).success).toBe(true);
		expect(updateApplicationDomainSchema.safeParse({ action: 'refresh_tls' }).success).toBe(true);
		expect(updateApplicationDomainSchema.safeParse({ action: 'delete' }).success).toBe(false);
		expect(domainAccessActionSchema.safeParse({ action: 'approve' }).success).toBe(true);
		expect(domainAccessActionSchema.safeParse({ action: 'reject' }).success).toBe(true);
		expect(domainAccessActionSchema.safeParse({ action: 'revoke' }).success).toBe(true);
		expect(domainAccessActionSchema.safeParse({ action: 'allow' }).success).toBe(false);
	});

	it('validates root-domain ownership request input', () => {
		expect(registerDomainOwnershipSchema.safeParse({ hostname: 'example.com' }).success).toBe(true);
		expect(registerDomainOwnershipSchema.safeParse({ hostname: 'https://example.com' }).success).toBe(false);
	});

	it('validates application deployment edits', () => {
		expect(updateApplicationSchema.safeParse({ branch: 'main', baseDirectory: '/', port: 3000 }).success).toBe(true);
		expect(updateApplicationSchema.safeParse({ branch: 'main', baseDirectory: '../private', port: 70000 }).success).toBe(false);
	});
});

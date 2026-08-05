import { describe, expect, it } from 'vitest';
import { getDomain } from 'tldts';

import { parseZoneFile } from '@services/domains/dnsManagementService';
import { createDnsRecordSchema, importDnsSchema } from '@schemas/dns';
import { dnsProviderCodeSchema, saveDnsProviderSchema } from '@schemas/dnsProvider';

describe('managed DNS validation and import', () => {
	it('classifies registrable roots without treating external subdomains as root domains', () => {
		expect(getDomain('example.co.uk', { allowPrivateDomains: true })).toBe('example.co.uk');
		expect(getDomain('shop.example.co.uk', { allowPrivateDomains: true })).toBe('example.co.uk');
	});

	it('parses common BIND records into a reviewable draft', () => {
		const result = parseZoneFile('example.com. 3600 IN A 203.0.113.2\nwww 300 IN CNAME example.com.\n@ 300 IN MX 10 mail.example.com.\n_dmarc 300 IN TXT "v=DMARC1; p=none"', 'example.com');
		expect(result.records).toEqual(expect.arrayContaining([
			expect.objectContaining({ name: '@', type: 'A', content: '203.0.113.2' }),
			expect.objectContaining({ name: 'www', type: 'CNAME', content: 'example.com.' }),
			expect.objectContaining({ name: '@', type: 'MX', priority: 10 }),
		]));
	});

	it('accepts platform-managed or one-time credentials for provider capture', () => {
		expect(importDnsSchema.safeParse({ source: 'public_scan' }).success).toBe(true);
		expect(importDnsSchema.safeParse({ source: 'godaddy' }).success).toBe(true);
		expect(importDnsSchema.safeParse({ source: 'hostinger', apiToken: 'secure-token' }).success).toBe(true);
		expect(createDnsRecordSchema.safeParse({ name: '*', type: 'A', content: '203.0.113.2', ttl: 300, proxied: false }).success).toBe(true);
	});

	it('validates provider connection rotation without requiring the retained token', () => {
		expect(dnsProviderCodeSchema.safeParse('powerdns').success).toBe(true);
		expect(saveDnsProviderSchema.safeParse({ accountIdentifier: 'account-id', token: 'secure-token' }).success).toBe(true);
		expect(saveDnsProviderSchema.safeParse({ accountIdentifier: 'account-id' }).success).toBe(true);
		expect(saveDnsProviderSchema.safeParse({ token: 'short' }).success).toBe(false);
	});
});

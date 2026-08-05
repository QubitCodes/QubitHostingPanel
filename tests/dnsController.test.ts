import { describe, expect, it } from 'vitest';

import {
	customerDnsRecord,
	qualifiedDnsRecordName,
} from '@controllers/DnsController';
import { createDnsRecordSchema } from '@schemas/dns';

describe('DNS customer contract', () => {
	it('qualifies relative record names without duplicating the zone', () => {
		expect(qualifiedDnsRecordName('@', 'example.com')).toBe('example.com');
		expect(qualifiedDnsRecordName('www', 'example.com')).toBe(
			'www.example.com',
		);
		expect(qualifiedDnsRecordName('www.example.com', 'example.com')).toBe(
			'www.example.com',
		);
	});

	it('does not expose provider identifiers through the customer DTO', () => {
		const record = customerDnsRecord({
			id: 'record-id',
			zoneId: 'zone-id',
			applicationDomainId: null,
			name: 'www',
			type: 'A',
			content: '203.0.113.10',
			ttl: 300,
			priority: null,
			proxied: false,
			source: 'user',
			providerRecordId: 'private-provider-id',
			isEnabled: true,
			createdAt: new Date('2026-08-05T00:00:00.000Z'),
			updatedAt: new Date('2026-08-05T00:00:00.000Z'),
			deletedAt: null,
			deleteReason: null,
		});

		expect(record.published).toBe(true);
		expect(record).not.toHaveProperty('providerRecordId');
		expect(record).not.toHaveProperty('zoneId');
	});

	it('rejects proxying for record types that cannot carry web traffic', () => {
		expect(
			createDnsRecordSchema.safeParse({
				name: '@',
				type: 'MX',
				content: 'mail.example.com',
				ttl: 300,
				priority: 10,
				proxied: true,
			}).success,
		).toBe(false);
	});
});

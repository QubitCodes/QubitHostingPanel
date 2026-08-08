import { describe, expect, it } from 'vitest';

import { databaseExternalAccessAcknowledgementSchema } from '@schemas/databaseExternalAccess';
import { cloneLogicalDatabaseSchema, databaseExternalAccessSchema, moveLogicalDatabaseSchema, renameLogicalDatabaseSchema } from '@schemas/logicalDatabase';

describe('advanced database lifecycle validation', () => {
	it('requires exact impact acknowledgement for rename and move requests', () => {
		expect(renameLogicalDatabaseSchema.safeParse({ name: 'renamed_db', acceptedImpact: true, confirmationName: 'q_100001_old', connectedApplicationNames: ['App'] }).success).toBe(true);
		expect(renameLogicalDatabaseSchema.safeParse({ name: 'renamed_db', acceptedImpact: false, confirmationName: 'q_100001_old' }).success).toBe(false);
		expect(moveLogicalDatabaseSchema.safeParse({ name: 'moved_db', acceptedImpact: true, confirmationName: 'q_100001_old', targetWorkspacePublicId: 100002 }).success).toBe(true);
		expect(cloneLogicalDatabaseSchema.safeParse({ name: 'clone_db', confirmationName: 'q_100001_old' }).success).toBe(true);
	});

	it('accepts bounded IPv4 and IPv6 allowlists and rejects malformed CIDRs', () => {
		expect(databaseExternalAccessSchema.safeParse({ allowedCidrs: ['203.0.113.10/32', '2001:db8::/64'] }).success).toBe(true);
		expect(databaseExternalAccessSchema.safeParse({ allowedCidrs: ['203.0.113.10/33'] }).success).toBe(false);
		expect(databaseExternalAccessSchema.safeParse({ allowedCidrs: ['not-an-address'] }).success).toBe(false);
		expect(databaseExternalAccessSchema.safeParse({ allowedCidrs: [] }).success).toBe(false);
	});

	it('validates revision-bound host acknowledgements', () => {
		const valid = { results: [{ ruleId: '00000000-0000-4000-8000-000000000001', revision: 'revision-1', success: true }] };
		expect(databaseExternalAccessAcknowledgementSchema.safeParse(valid).success).toBe(true);
		expect(databaseExternalAccessAcknowledgementSchema.safeParse({ results: [{ ...valid.results[0], ruleId: 'bad' }] }).success).toBe(false);
	});
});

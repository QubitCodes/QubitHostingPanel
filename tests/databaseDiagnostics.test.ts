import { describe, expect, it } from 'vitest';

import { cancelDatabaseSessionSchema, databaseDiagnosticsQuerySchema } from '@schemas/databaseDiagnostics';
import { databaseDiagnosticQueryMetadata, validateDatabaseCancellationConfirmation } from '@services/databases/databaseDiagnosticsService';

describe('database diagnostics policy', () => {
	it('bounds slow-query thresholds and rejects unexpected controls', () => {
		expect(databaseDiagnosticsQuerySchema.parse({})).toEqual({ slowThresholdSeconds: 5 });
		expect(databaseDiagnosticsQuerySchema.parse({ slowThresholdSeconds: '30' })).toEqual({ slowThresholdSeconds: 30 });
		expect(databaseDiagnosticsQuerySchema.safeParse({ slowThresholdSeconds: 0 }).success).toBe(false);
		expect(databaseDiagnosticsQuerySchema.safeParse({ slowThresholdSeconds: 5, revealQueries: true }).success).toBe(false);
	});

	it('accepts only numeric database session identifiers', () => {
		expect(cancelDatabaseSessionSchema.safeParse({ confirmation: 'tenant_db', sessionId: '9123' }).success).toBe(true);
		expect(cancelDatabaseSessionSchema.safeParse({ confirmation: 'tenant_db', sessionId: '1; DROP DATABASE tenant_db' }).success).toBe(false);
	});

	it('returns a fingerprint and statement type without returning query text', () => {
		const metadata = databaseDiagnosticQueryMetadata("SELECT * FROM customers WHERE mobile = '7907577655'");
		expect(metadata.statementType).toBe('SELECT');
		expect(metadata.queryFingerprint).toMatch(/^[a-f0-9]{64}$/);
		expect(JSON.stringify(metadata)).not.toContain('7907577655');
	});

	it('requires the exact logical database name before cancellation', () => {
		expect(() => validateDatabaseCancellationConfirmation('tenant_db', 'tenant_db')).not.toThrow();
		expect(() => validateDatabaseCancellationConfirmation('TENANT_DB', 'tenant_db')).toThrow(/exactly match/);
	});
});

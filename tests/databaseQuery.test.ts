import { describe, expect, it } from 'vitest';

import { databaseQueryExportSchema, databaseQueryRequestSchema, databaseSavedQueryCreateSchema, databaseSavedQueryUpdateSchema } from '@schemas/databaseQuery';
import { databaseImportRequestSchema, databaseTransferExportRequestSchema, databaseTransferJobActionSchema } from '@schemas/databaseTransfer';
import { databaseQueryPolicy, databaseQueryResultCsv, queryPolicyView } from '@services/databases/databaseQueryService';
import { parseTransferCsv } from '@services/databases/databaseTransferService';

describe('database query policy', () => {
	it('allows bounded read statements and ignores comment or literal content', () => {
		expect(databaseQueryPolicy("SELECT 'DROP USER' AS value -- DELETE\n", false)).toMatchObject({ readOnly: true, statementType: 'SELECT' });
		expect(queryPolicyView("SELECT 'secret' -- comment")).not.toContain('secret');
	});

	it('requires explicit change mode for data writes', () => {
		expect(() => databaseQueryPolicy('UPDATE users SET active = false', false)).toThrow(/Enable data changes/);
		expect(databaseQueryPolicy('UPDATE users SET active = false', true)).toMatchObject({ readOnly: false, statementType: 'UPDATE' });
	});

	it('blocks multiple, structural, privilege, and session statements', () => {
		for (const query of ['SELECT 1; SELECT 2', 'DROP TABLE users', 'GRANT ALL ON users TO guest', 'SET ROLE admin', 'SELECT * INTO copied_users FROM users', 'DELETE FROM users RETURNING *']) expect(() => databaseQueryPolicy(query, true)).toThrow();
	});

	it('strictly validates query and import payloads', () => {
		expect(databaseQueryRequestSchema.safeParse({ query: 'SELECT 1', allowChanges: false, rowLimit: 100 }).success).toBe(true);
		expect(databaseQueryRequestSchema.safeParse({ query: 'SELECT 1', allowChanges: false, rowLimit: 501 }).success).toBe(false);
		expect(databaseImportRequestSchema.safeParse({ confirmation: 'db', mode: 'replace', uploadToken: 'x'.repeat(40) }).success).toBe(true);
		expect(databaseImportRequestSchema.safeParse({ confirmation: 'db', mode: 'unsafe', uploadToken: 'x'.repeat(40) }).success).toBe(false);
		expect(databaseTransferExportRequestSchema.safeParse({ format: 'native', scope: 'database' }).success).toBe(true);
		expect(databaseTransferExportRequestSchema.safeParse({ format: 'csv', scope: 'database' }).success).toBe(false);
		expect(databaseTransferExportRequestSchema.safeParse({ format: 'json', scope: 'table', schema: 'public', table: 'users' }).success).toBe(true);
		expect(databaseTransferJobActionSchema.safeParse({ action: 'cancel' }).success).toBe(true);
		expect(databaseQueryExportSchema.safeParse({ query: 'SELECT 1', rowLimit: 10_000 }).success).toBe(true);
		expect(databaseQueryExportSchema.safeParse({ query: 'SELECT 1', rowLimit: 10_001 }).success).toBe(false);
		expect(databaseSavedQueryCreateSchema.safeParse({ name: 'Active users', query: 'SELECT 1', allowChanges: false, rowLimit: 100, isFavorite: true }).success).toBe(true);
		expect(databaseSavedQueryUpdateSchema.safeParse({}).success).toBe(false);
	});

	it('serializes bounded query results as UTF-8 CSV', () => {
		const csv = databaseQueryResultCsv({ affectedRows: 1, columns: ['name', 'details'], durationMs: 1, fingerprint: 'hash', readOnly: true, rows: [{ name: 'A, "B"', details: { active: true } }], statementType: 'SELECT', truncated: false });
		expect(csv.startsWith('\uFEFF')).toBe(true);
		expect(csv).toContain('"A, ""B"""');
		expect(csv).toContain('"{""active"":true}"');
	});

	it('parses quoted CSV rows without allowing unsafe header identifiers', () => {
		expect(parseTransferCsv('id,name\r\n1,"A, B"\r\n')).toEqual([{ id: '1', name: 'A, B' }]);
		expect(() => parseTransferCsv('unsafe-name\nvalue\n')).toThrow(/identifiers/);
	});
});

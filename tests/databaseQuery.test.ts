import { describe, expect, it } from 'vitest';

import { databaseQueryRequestSchema } from '@schemas/databaseQuery';
import { databaseImportRequestSchema } from '@schemas/databaseTransfer';
import { databaseQueryPolicy, queryPolicyView } from '@services/databases/databaseQueryService';

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
	});
});

import { describe, expect, it } from 'vitest';

import { postgresStringLiteral } from '@services/databases/PostgresSharedDatabaseProvisioner';

describe('PostgreSQL shared database provisioning', () => {
	it('quotes role passwords for PostgreSQL DDL', () => {
		expect(postgresStringLiteral("safe'password")).toBe("'safe''password'");
	});

	it('keeps injection-like input inside one string literal', () => {
		expect(postgresStringLiteral("x'; DROP ROLE admin; --")).toBe("'x''; DROP ROLE admin; --'");
	});
});

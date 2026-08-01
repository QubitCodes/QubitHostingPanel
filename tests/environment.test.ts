import { afterEach, describe, expect, it } from 'vitest';

import { getEnvironment, resetEnvironmentForTests } from '@config/env';

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;

afterEach(() => {
	process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
	resetEnvironmentForTests();
});

describe('environment validation', () => {
	it('accepts a PostgreSQL URL', () => {
		process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/panel';

		expect(getEnvironment().DATABASE_URL).toContain('postgresql://');
	});

	it('rejects a non-PostgreSQL URL', () => {
		process.env.DATABASE_URL = 'https://example.com/database';

		expect(() => getEnvironment()).toThrow();
	});
});

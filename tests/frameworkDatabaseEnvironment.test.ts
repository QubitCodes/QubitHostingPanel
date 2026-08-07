import { describe, expect, it } from 'vitest';

import { frameworkDatabaseEnvironment } from '@services/applications/frameworkDatabaseEnvironmentService';

const connection = {
	databaseName: 'fixture_db',
	engine: 'postgresql',
	host: 'database.internal',
	password: 'p@ss/word',
	port: 5432,
	username: 'fixture_user',
};

describe('framework database environment', () => {
	it('maps Laravel PostgreSQL variables', () => {
		expect(frameworkDatabaseEnvironment('laravel', connection)).toContainEqual({
			key: 'DB_CONNECTION',
			value: 'pgsql',
		});
	});

	it('maps WordPress host and credentials', () => {
		expect(frameworkDatabaseEnvironment('wordpress', connection)).toContainEqual({
			key: 'WORDPRESS_DB_HOST',
			value: 'database.internal:5432',
		});
	});

	it('maps Django variables used by its settings module', () => {
		const variables = frameworkDatabaseEnvironment('django', connection);
		expect(variables).toContainEqual({ key: 'DB_ENGINE', value: 'postgresql' });
		expect(variables).toContainEqual({
			key: 'DB_DATABASE',
			value: 'fixture_db',
		});
	});

	it('encodes Rails DATABASE_URL credentials', () => {
		expect(frameworkDatabaseEnvironment('rails', connection)).toEqual([
			{
				key: 'DATABASE_URL',
				value:
					'postgres://fixture_user:p%40ss%2Fword@database.internal:5432/fixture_db',
			},
		]);
	});
});

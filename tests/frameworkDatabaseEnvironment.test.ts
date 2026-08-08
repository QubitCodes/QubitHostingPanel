import { describe, expect, it } from 'vitest';

import { databaseConnectionUrl, frameworkDatabaseEnvironment, isDatabaseConnectionEnvironmentKey, resolveManagedDatabaseEnvironmentVariables } from '@services/applications/frameworkDatabaseEnvironmentService';

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

	it('generates encoded PostgreSQL and MySQL connection strings', () => {
		expect(databaseConnectionUrl(connection)).toBe('postgresql://fixture_user:p%40ss%2Fword@database.internal:5432/fixture_db');
		expect(databaseConnectionUrl({ ...connection, engine: 'mysql', port: 3306 })).toBe('mysql://fixture_user:p%40ss%2Fword@database.internal:3306/fixture_db');
	});

	it('recognizes conventional single database connection keys', () => {
		for (const key of ['DATABASE_URL', 'DATABASE_URI', 'DB_URL', 'DB_DSN', 'CONNECTION_STRING', 'POSTGRES_URL', 'POSTGRESQL_URL', 'MYSQL_URL'])
			expect(isDatabaseConnectionEnvironmentKey(key)).toBe(true);
		expect(isDatabaseConnectionEnvironmentKey('EXTERNAL_API_URL')).toBe(false);
	});

	it('fills empty connection keys and preserves explicit customer values', () => {
		expect(resolveManagedDatabaseEnvironmentVariables([
			{ key: 'DATABASE_URL', value: '' },
			{ key: 'POSTGRES_URL', value: 'postgresql://customer-managed' },
			{ key: 'EXTERNAL_API_URL', value: '' },
		], connection)).toEqual([
			{ key: 'DATABASE_URL', value: 'postgresql://fixture_user:p%40ss%2Fword@database.internal:5432/fixture_db' },
			{ key: 'POSTGRES_URL', value: 'postgresql://customer-managed' },
			{ key: 'EXTERNAL_API_URL', value: '' },
		]);
	});
});

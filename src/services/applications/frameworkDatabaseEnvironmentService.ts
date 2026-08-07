export interface FrameworkDatabaseConnection {
	databaseName: string;
	engine: string;
	host: string;
	password: string;
	port: number;
	username: string;
}

export interface FrameworkDatabaseVariable {
	key: string;
	value: string;
}

/**
 * Adapts one managed database connection to framework-native environment
 * names. Generic DATABASE_* variables are added separately by provisioning.
 */
export function frameworkDatabaseEnvironment(
	framework: string | null | undefined,
	connection: FrameworkDatabaseConnection,
): FrameworkDatabaseVariable[] {
	if (framework === 'laravel')
		return [
			{
				key: 'DB_CONNECTION',
				value: connection.engine === 'postgresql' ? 'pgsql' : 'mysql',
			},
			{ key: 'DB_HOST', value: connection.host },
			{ key: 'DB_PORT', value: String(connection.port) },
			{ key: 'DB_DATABASE', value: connection.databaseName },
			{ key: 'DB_USERNAME', value: connection.username },
			{ key: 'DB_PASSWORD', value: connection.password },
		];
	if (framework === 'wordpress')
		return [
			{
				key: 'WORDPRESS_DB_HOST',
				value: `${connection.host}:${connection.port}`,
			},
			{ key: 'WORDPRESS_DB_NAME', value: connection.databaseName },
			{ key: 'WORDPRESS_DB_USER', value: connection.username },
			{ key: 'WORDPRESS_DB_PASSWORD', value: connection.password },
		];
	if (framework === 'django')
		return [
			{ key: 'DB_ENGINE', value: connection.engine },
			{ key: 'DB_HOST', value: connection.host },
			{ key: 'DB_PORT', value: String(connection.port) },
			{ key: 'DB_DATABASE', value: connection.databaseName },
			{ key: 'DB_USERNAME', value: connection.username },
			{ key: 'DB_PASSWORD', value: connection.password },
		];
	if (framework === 'rails') {
		const protocol = connection.engine === 'postgresql' ? 'postgres' : 'mysql2';
		return [
			{
				key: 'DATABASE_URL',
				value: `${protocol}://${encodeURIComponent(connection.username)}:${encodeURIComponent(connection.password)}@${connection.host}:${connection.port}/${encodeURIComponent(connection.databaseName)}`,
			},
		];
	}
	return [];
}

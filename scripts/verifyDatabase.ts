import { Client } from 'pg';

import { getEnvironment } from '@config/env';

interface DatabaseVerification {
	auditLogColumnCount: number;
	auditLogsExists: boolean;
	database: string;
	drizzleMigrationCount: number;
}

/** Verifies Phase 0 database objects without changing application data. */
async function verifyDatabase(): Promise<DatabaseVerification> {
	const client = new Client({ connectionString: getEnvironment().DATABASE_URL });

	try {
		await client.connect();

		const databaseResult = await client.query<{ database: string }>(
			'SELECT current_database() AS database'
		);
		const tableResult = await client.query<{ exists: boolean }>(`
			SELECT EXISTS (
				SELECT 1
				FROM information_schema.tables
				WHERE table_schema = 'public'
					AND table_name = 'audit_logs'
			) AS exists
		`);
		const columnResult = await client.query<{ count: number }>(`
			SELECT COUNT(*)::integer AS count
			FROM information_schema.columns
			WHERE table_schema = 'public'
				AND table_name = 'audit_logs'
		`);
		const migrationResult = await client.query<{ count: number }>(
			'SELECT COUNT(*)::integer AS count FROM drizzle.__drizzle_migrations'
		);

		return {
			auditLogColumnCount: columnResult.rows[0]?.count ?? 0,
			auditLogsExists: tableResult.rows[0]?.exists ?? false,
			database: databaseResult.rows[0]?.database ?? 'unknown',
			drizzleMigrationCount: migrationResult.rows[0]?.count ?? 0
		};
	} finally {
		await client.end();
	}
}

const result = await verifyDatabase();

if (!result.auditLogsExists || result.auditLogColumnCount !== 13 || result.drizzleMigrationCount < 1) {
	throw new Error('Phase 0 database verification failed.');
}

console.info(JSON.stringify(result));

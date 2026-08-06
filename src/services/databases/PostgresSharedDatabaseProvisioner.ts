import pg from 'pg';

import type { CreateLogicalDatabaseInput, CreatedLogicalDatabase, DeleteLogicalDatabaseInput, MeasureLogicalDatabaseInput, SharedDatabaseProvisioner } from '@services/databases/SharedDatabaseProvisioner';

const identifier = (value: string): string => `"${value.replaceAll('"', '""')}"`;

/** Escapes a PostgreSQL string literal for DDL statements that reject bind parameters. */
export const postgresStringLiteral = (value: string): string => `'${value.replaceAll("'", "''")}'`;

/** Builds the database-level isolation statement applied after database creation. */
export const postgresDatabaseIsolationDdl = (databaseName: string): string => `REVOKE CONNECT ON DATABASE ${identifier(databaseName)} FROM PUBLIC`;

/** Provisions one PostgreSQL database and a login that owns only that database. */
export class PostgresSharedDatabaseProvisioner implements SharedDatabaseProvisioner {
	/** Permanently removes the isolated database and its login after disconnecting active clients. */
	public async deleteLogicalDatabase(input: DeleteLogicalDatabaseInput): Promise<void> {
		const admin = new pg.Client({ host: input.host, port: input.port, database: input.adminDatabase, user: input.adminUsername, password: input.adminPassword, ssl: input.tlsMode === 'disabled' ? false : { rejectUnauthorized: input.tlsMode === 'verify-full' }, connectionTimeoutMillis: 15_000 });
		await admin.connect();
		try {
			await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [input.databaseName]);
			await admin.query(`DROP DATABASE IF EXISTS ${identifier(input.databaseName)}`);
			await admin.query(`DROP ROLE IF EXISTS ${identifier(input.username)}`);
		} finally { await admin.end(); }
	}

	public async measureLogicalDatabaseBytes(input: MeasureLogicalDatabaseInput): Promise<number> {
		const admin = new pg.Client({ host: input.host, port: input.port, database: input.adminDatabase, user: input.adminUsername, password: input.adminPassword, ssl: input.tlsMode === 'disabled' ? false : { rejectUnauthorized: input.tlsMode === 'verify-full' }, connectionTimeoutMillis: 15_000 });
		await admin.connect();
		try { const result = await admin.query<{ bytes: string }>('SELECT pg_database_size($1)::text AS bytes', [input.databaseName]); return Number(result.rows[0]?.bytes ?? 0); }
		finally { await admin.end(); }
	}

	public async createLogicalDatabase(input: CreateLogicalDatabaseInput): Promise<CreatedLogicalDatabase> {
		const admin = new pg.Client({ host: input.host, port: input.port, database: input.adminDatabase, user: input.adminUsername, password: input.adminPassword, ssl: input.tlsMode === 'disabled' ? false : { rejectUnauthorized: input.tlsMode === 'verify-full' }, connectionTimeoutMillis: 15_000 });
		await admin.connect();
		try {
			await admin.query(`CREATE ROLE ${identifier(input.username)} LOGIN PASSWORD ${postgresStringLiteral(input.password)}`);
			await admin.query(`CREATE DATABASE ${identifier(input.databaseName)} OWNER ${identifier(input.username)}`);
			await admin.query(postgresDatabaseIsolationDdl(input.databaseName));
			if (input.connectionLimit) await admin.query(`ALTER DATABASE ${identifier(input.databaseName)} CONNECTION LIMIT ${Math.max(1, Math.trunc(input.connectionLimit))}`);
		} catch (error) {
			await admin.query(`DROP DATABASE IF EXISTS ${identifier(input.databaseName)}`).catch(() => undefined);
			await admin.query(`DROP ROLE IF EXISTS ${identifier(input.username)}`).catch(() => undefined);
			throw error;
		} finally { await admin.end(); }
		return { databaseName: input.databaseName, engine: 'postgresql', host: input.host, password: input.password, port: input.port, tlsMode: input.tlsMode, username: input.username };
	}

	public async rotateCredential(input: CreateLogicalDatabaseInput & { password: string }): Promise<void> {
		const admin = new pg.Client({ host: input.host, port: input.port, database: input.adminDatabase, user: input.adminUsername, password: input.adminPassword, ssl: input.tlsMode === 'disabled' ? false : { rejectUnauthorized: input.tlsMode === 'verify-full' }, connectionTimeoutMillis: 15_000 });
		await admin.connect();
		try { await admin.query(`ALTER ROLE ${identifier(input.username)} PASSWORD ${postgresStringLiteral(input.password)}`); }
		finally { await admin.end(); }
	}
}

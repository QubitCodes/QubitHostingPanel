import mysql from 'mysql2/promise';
import pg from 'pg';

import type { DatabasePrivilege } from '@schemas/databaseAccess';
import type { SharedDatabaseEngine } from '@services/databases/SharedDatabaseProvisioner';

export interface DatabaseAdminConnection {
	adminDatabase: string;
	adminPassword: string;
	adminUsername: string;
	databaseName: string;
	engine: SharedDatabaseEngine;
	host: string;
	ownerUsername: string;
	port: number;
	tlsMode: 'disabled' | 'require' | 'verify-full';
}
export interface DatabaseGrantDefinition {
	accessLevel: 'custom' | 'owner' | 'read_only' | 'read_write';
	privileges: DatabasePrivilege[];
	scopes: Array<{ schema: string; table?: string }>;
}

const postgresIdentifier = (value: string): string => `"${value.replaceAll('"', '""')}"`;
const mysqlIdentifier = (value: string): string => `\`${value.replaceAll('`', '``')}\``;
const mysqlAccount = (username: string): string => `'${username.replaceAll("'", "''")}'@'%'`;
const postgresString = (value: string): string => `'${value.replaceAll("'", "''")}'`;

/** Resolves preset access levels to their explicit engine privilege set. */
export function databaseGrantPrivileges(definition: DatabaseGrantDefinition): DatabasePrivilege[] {
	if (definition.accessLevel === 'read_only') return ['select'];
	if (definition.accessLevel === 'read_write' || definition.accessLevel === 'owner') return ['select', 'insert', 'update', 'delete'];
	return definition.privileges;
}

/** Applies login and least-privilege grants through cluster-administrator credentials. */
export class DatabaseAccessService {
	public constructor(private readonly connection: DatabaseAdminConnection) {}

	/** Creates a restricted engine login without granting database access yet. */
	public async createUser(username: string, password: string): Promise<void> {
		if (this.connection.engine === 'postgresql') {
			const client = await this.postgres(this.connection.adminDatabase);
			try {
				await client.query(`CREATE ROLE ${postgresIdentifier(username)} LOGIN PASSWORD ${postgresString(password)}`);
			} finally {
				await client.end();
			}
			return;
		}
		const client = await this.mysql();
		try {
			await client.query(`CREATE USER ${mysqlAccount(username)} IDENTIFIED BY ?`, [password]);
		} finally {
			await client.end();
		}
	}

	/** Replaces this database's current grants with the validated definition. */
	public async apply(username: string, definition: DatabaseGrantDefinition): Promise<void> {
		if (this.connection.engine === 'postgresql') return this.applyPostgres(username, definition);
		const client = await this.mysql();
		try {
			await this.revokeMysql(client, username);
			const selected = databaseGrantPrivileges(definition).map((item) => item.toUpperCase()).join(', ');
			const scopes = definition.accessLevel === 'custom' && definition.scopes.length
				? definition.scopes
				: [{ schema: this.connection.databaseName }];
			for (const scope of scopes) await client.query(
				`GRANT ${selected} ON ${mysqlIdentifier(this.connection.databaseName)}.${scope.table ? mysqlIdentifier(scope.table) : '*'} TO ${mysqlAccount(username)}`,
			);
		} finally {
			await client.end();
		}
	}

	/** Revokes this database's grants without touching other databases. */
	public async revoke(username: string): Promise<void> {
		if (this.connection.engine === 'postgresql') {
			const client = await this.postgres(this.connection.databaseName);
			try {
				await this.revokePostgres(client, username);
			} finally {
				await client.end();
			}
			return;
		}
		const client = await this.mysql();
		try {
			await this.revokeMysql(client, username);
		} finally {
			await client.end();
		}
	}

	/** Enables or disables authentication for the shared login at cluster scope. */
	public async setEnabled(username: string, enabled: boolean): Promise<void> {
		if (this.connection.engine === 'postgresql') {
			const client = await this.postgres(this.connection.adminDatabase);
			try {
				await client.query(`ALTER ROLE ${postgresIdentifier(username)} ${enabled ? 'LOGIN' : 'NOLOGIN'}`);
			} finally {
				await client.end();
			}
			return;
		}
		const client = await this.mysql();
		try {
			await client.query(`ALTER USER ${mysqlAccount(username)} ACCOUNT ${enabled ? 'UNLOCK' : 'LOCK'}`);
		} finally {
			await client.end();
		}
	}

	/** Rotates the shared login password at cluster scope. */
	public async rotate(username: string, password: string): Promise<void> {
		if (this.connection.engine === 'postgresql') {
			const client = await this.postgres(this.connection.adminDatabase);
			try {
				await client.query(`ALTER ROLE ${postgresIdentifier(username)} PASSWORD ${postgresString(password)}`);
			} finally {
				await client.end();
			}
			return;
		}
		const client = await this.mysql();
		try {
			await client.query(`ALTER USER ${mysqlAccount(username)} IDENTIFIED BY ?`, [password]);
		} finally {
			await client.end();
		}
	}

	/** Permanently removes an unreferenced login. */
	public async deleteUser(username: string): Promise<void> {
		if (this.connection.engine === 'postgresql') {
			const client = await this.postgres(this.connection.adminDatabase);
			try {
				await client.query(`DROP ROLE ${postgresIdentifier(username)}`);
			} finally {
				await client.end();
			}
			return;
		}
		const client = await this.mysql();
		try {
			await client.query(`DROP USER ${mysqlAccount(username)}`);
		} finally {
			await client.end();
		}
	}

	/** Applies PostgreSQL table and sequence permissions within the requested scope. */
	private async applyPostgres(username: string, definition: DatabaseGrantDefinition): Promise<void> {
		const client = await this.postgres(this.connection.databaseName);
		try {
			await this.revokePostgres(client, username);
			await client.query(`GRANT CONNECT ON DATABASE ${postgresIdentifier(this.connection.databaseName)} TO ${postgresIdentifier(username)}`);
			const rows = await client.query<{ schema: string }>("SELECT nspname AS schema FROM pg_namespace WHERE nspname NOT IN ('pg_catalog','information_schema') AND nspname NOT LIKE 'pg_toast%'");
			const scopes: Array<{ schema: string; table?: string }> = definition.accessLevel === 'custom' && definition.scopes.length
				? definition.scopes
				: rows.rows;
			const privileges = databaseGrantPrivileges(definition);
			const selected = privileges.map((item) => item.toUpperCase()).join(', ');
			for (const scope of scopes) {
				await client.query(`GRANT USAGE ON SCHEMA ${postgresIdentifier(scope.schema)} TO ${postgresIdentifier(username)}`);
				if (scope.table) {
					await client.query(`GRANT ${selected} ON TABLE ${postgresIdentifier(scope.schema)}.${postgresIdentifier(scope.table)} TO ${postgresIdentifier(username)}`);
					if (privileges.includes('insert')) await this.grantPostgresTableSequences(client, username, scope.schema, scope.table);
				} else {
					await client.query(`GRANT ${selected} ON ALL TABLES IN SCHEMA ${postgresIdentifier(scope.schema)} TO ${postgresIdentifier(username)}`);
					await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${postgresIdentifier(this.connection.ownerUsername)} IN SCHEMA ${postgresIdentifier(scope.schema)} GRANT ${selected} ON TABLES TO ${postgresIdentifier(username)}`);
					if (privileges.includes('insert')) {
						await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${postgresIdentifier(scope.schema)} TO ${postgresIdentifier(username)}`);
						await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${postgresIdentifier(this.connection.ownerUsername)} IN SCHEMA ${postgresIdentifier(scope.schema)} GRANT USAGE, SELECT ON SEQUENCES TO ${postgresIdentifier(username)}`);
					}
				}
			}
		} finally {
			await client.end();
		}
	}

	/** Grants only sequences owned by serial/identity columns of one custom table. */
	private async grantPostgresTableSequences(client: pg.Client, username: string, schema: string, table: string): Promise<void> {
		const sequences = await client.query<{ schema: string; sequence: string }>(`
			SELECT sequence_namespace.nspname AS schema, sequence.relname AS sequence
			FROM pg_class table_class
			JOIN pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace
			JOIN pg_depend dependency ON dependency.refobjid = table_class.oid AND dependency.deptype IN ('a', 'i')
			JOIN pg_class sequence ON sequence.oid = dependency.objid AND sequence.relkind = 'S'
			JOIN pg_namespace sequence_namespace ON sequence_namespace.oid = sequence.relnamespace
			WHERE table_namespace.nspname = $1 AND table_class.relname = $2
		`, [schema, table]);
		for (const sequence of sequences.rows) await client.query(
			`GRANT USAGE, SELECT ON SEQUENCE ${postgresIdentifier(sequence.schema)}.${postgresIdentifier(sequence.sequence)} TO ${postgresIdentifier(username)}`,
		);
	}

	/** Removes current and future PostgreSQL permissions for this database only. */
	private async revokePostgres(client: pg.Client, username: string): Promise<void> {
		const rows = await client.query<{ schema: string }>("SELECT nspname AS schema FROM pg_namespace WHERE nspname NOT IN ('pg_catalog','information_schema') AND nspname NOT LIKE 'pg_toast%'");
		for (const { schema } of rows.rows) {
			await client.query(`REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA ${postgresIdentifier(schema)} FROM ${postgresIdentifier(username)}`);
			await client.query(`REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ${postgresIdentifier(schema)} FROM ${postgresIdentifier(username)}`);
			await client.query(`REVOKE USAGE ON SCHEMA ${postgresIdentifier(schema)} FROM ${postgresIdentifier(username)}`);
			await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${postgresIdentifier(this.connection.ownerUsername)} IN SCHEMA ${postgresIdentifier(schema)} REVOKE ALL ON TABLES FROM ${postgresIdentifier(username)}`);
			await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${postgresIdentifier(this.connection.ownerUsername)} IN SCHEMA ${postgresIdentifier(schema)} REVOKE ALL ON SEQUENCES FROM ${postgresIdentifier(username)}`);
		}
		await client.query(`REVOKE CONNECT ON DATABASE ${postgresIdentifier(this.connection.databaseName)} FROM ${postgresIdentifier(username)}`);
	}

	/** Opens a short-lived PostgreSQL administrator connection. */
	private async postgres(database: string): Promise<pg.Client> {
		const client = new pg.Client({
			host: this.connection.host,
			port: this.connection.port,
			database,
			user: this.connection.adminUsername,
			password: this.connection.adminPassword,
			ssl: this.connection.tlsMode === 'disabled' ? false : { rejectUnauthorized: this.connection.tlsMode === 'verify-full' },
			connectionTimeoutMillis: 15000,
		});
		await client.connect();
		return client;
	}

	/** Revokes only this logical MySQL database's current grants. */
	private async revokeMysql(client: mysql.Connection, username: string): Promise<void> {
		const [rows] = await client.query<mysql.RowDataPacket[]>(
			'SELECT table_name FROM information_schema.tables WHERE table_schema = ?',
			[this.connection.databaseName],
		);
		for (const row of rows) await client.query(
			`REVOKE ALL PRIVILEGES ON ${mysqlIdentifier(this.connection.databaseName)}.${mysqlIdentifier(String(row.table_name))} FROM ${mysqlAccount(username)}`,
		).catch(() => undefined);
		await client.query(
			`REVOKE ALL PRIVILEGES ON ${mysqlIdentifier(this.connection.databaseName)}.* FROM ${mysqlAccount(username)}`,
		).catch(() => undefined);
	}

	/** Opens a short-lived MySQL administrator connection. */
	private mysql(): Promise<mysql.Connection> {
		return mysql.createConnection({
			host: this.connection.host,
			port: this.connection.port,
			database: this.connection.adminDatabase,
			user: this.connection.adminUsername,
			password: this.connection.adminPassword,
			ssl: this.connection.tlsMode === 'disabled' ? undefined : { rejectUnauthorized: this.connection.tlsMode === 'verify-full' },
			connectTimeout: 15000,
		});
	}
}

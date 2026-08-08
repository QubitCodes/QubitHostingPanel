import { createHash } from 'node:crypto';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import pg from 'pg';

import type { CancelDatabaseSessionRequest } from '@schemas/databaseDiagnostics';
import type { DatabaseExplorerConnection } from '@services/databases/databaseExplorerService';

export interface DatabaseDiagnosticSession {
	durationMs: number;
	id: string;
	queryFingerprint: string | null;
	state: string;
	statementType: string | null;
	waitEvent: string | null;
}

export interface DatabaseDiagnosticLock {
	granted: boolean;
	mode: string;
	objectName: string | null;
	sessionId: string;
}

export interface DatabaseDiagnosticIndex {
	indexName: string;
	scans: number | null;
	schemaName: string;
	sizeBytes: number | null;
	tableName: string;
	unused: boolean | null;
}

export interface DatabaseDiagnosticTableStorage {
	schemaName: string;
	sizeBytes: number;
	tableName: string;
}

export interface DatabaseDiagnostics {
	collectedAt: string;
	connections: { active: number; idle: number; serverMaximum: number | null; total: number };
	databaseSizeBytes: number;
	engine: 'mysql' | 'postgresql';
	indexes: DatabaseDiagnosticIndex[];
	locks: DatabaseDiagnosticLock[];
	sessions: DatabaseDiagnosticSession[];
	slowThresholdSeconds: number;
	tableStorage: DatabaseDiagnosticTableStorage[];
	warnings: string[];
}

function fingerprint(query: unknown): string | null {
	if (typeof query !== 'string' || !query.trim()) return null;
	return createHash('sha256').update(query.trim()).digest('hex');
}

function statementType(query: unknown): string | null {
	if (typeof query !== 'string') return null;
	return query.trim().match(/^[a-z]+/i)?.[0]?.toUpperCase() ?? null;
}

/** Produces non-reversible query metadata safe for API responses and audit context. */
export function databaseDiagnosticQueryMetadata(query: unknown): { queryFingerprint: string | null; statementType: string | null } {
	return { queryFingerprint: fingerprint(query), statementType: statementType(query) };
}

/** Applies the exact resource-name confirmation used before query cancellation. */
export function validateDatabaseCancellationConfirmation(confirmation: string, databaseName: string): void {
	if (confirmation !== databaseName) throw new Error('Confirmation must exactly match the database name.');
}

function numeric(value: unknown): number {
	const parsed = Number(value ?? 0);
	return Number.isFinite(parsed) ? parsed : 0;
}

/** Collects tenant-scoped operational signals without returning SQL text or result values. */
export class DatabaseDiagnosticsService {
	public constructor(private readonly connection: DatabaseExplorerConnection) {}

	public async collect(slowThresholdSeconds: number): Promise<DatabaseDiagnostics> {
		return this.connection.engine === 'postgresql'
			? this.collectPostgres(slowThresholdSeconds)
			: this.collectMysql(slowThresholdSeconds);
	}

	/** Cancels only an active query owned by this database login in this logical database. */
	public async cancel(input: CancelDatabaseSessionRequest): Promise<{ cancelled: boolean; sessionId: string }> {
		validateDatabaseCancellationConfirmation(input.confirmation, this.connection.databaseName);
		return this.connection.engine === 'postgresql' ? this.cancelPostgres(input.sessionId) : this.cancelMysql(input.sessionId);
	}

	private postgresClient(): pg.Client {
		return new pg.Client({
			database: this.connection.databaseName,
			host: this.connection.host,
			password: this.connection.password,
			port: this.connection.port,
			ssl: this.connection.tlsMode === 'disabled' ? undefined : { rejectUnauthorized: this.connection.tlsMode === 'verify-full' },
			user: this.connection.username,
			connectionTimeoutMillis: 8000,
		});
	}

	private async collectPostgres(slowThresholdSeconds: number): Promise<DatabaseDiagnostics> {
		const client = this.postgresClient();
		await client.connect();
		const warnings: string[] = [];
		try {
			await client.query('SET statement_timeout = 8000');
			const [storage, connections, sessions, locks, indexes, tables] = await Promise.all([
				client.query<{ bytes: string }>('SELECT pg_database_size(current_database())::text AS bytes'),
				client.query<{ active: string; idle: string; maximum: string; total: string }>(`
					SELECT count(*) FILTER (WHERE state = 'active')::text AS active,
						count(*) FILTER (WHERE state <> 'active')::text AS idle,
						count(*)::text AS total,
						current_setting('max_connections') AS maximum
					FROM pg_stat_activity WHERE datname = current_database()
				`),
				client.query<{ duration_ms: string; pid: number; query: string | null; state: string; wait_event: string | null }>(`
					SELECT pid, state, wait_event,
						GREATEST(0, EXTRACT(EPOCH FROM (clock_timestamp() - query_start)) * 1000)::bigint::text AS duration_ms,
						query
					FROM pg_stat_activity
					WHERE datname = current_database() AND usename = current_user
						AND pid <> pg_backend_pid() AND state = 'active'
						AND query_start <= clock_timestamp() - ($1 * interval '1 second')
					ORDER BY query_start ASC LIMIT 100
				`, [slowThresholdSeconds]),
				client.query<{ granted: boolean; mode: string; object_name: string | null; pid: number }>(`
					SELECT lock.pid, lock.mode, lock.granted,
						CASE WHEN relation.oid IS NULL THEN lock.locktype ELSE quote_ident(namespace.nspname) || '.' || quote_ident(relation.relname) END AS object_name
					FROM pg_locks lock
					JOIN pg_stat_activity activity ON activity.pid = lock.pid AND activity.datname = current_database()
					LEFT JOIN pg_class relation ON relation.oid = lock.relation
					LEFT JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
					WHERE lock.database = (SELECT oid FROM pg_database WHERE datname = current_database())
					ORDER BY lock.granted ASC, lock.pid LIMIT 100
				`),
				client.query<{ index_name: string; scans: string; schema_name: string; size_bytes: string; table_name: string }>(`
					SELECT schemaname AS schema_name, relname AS table_name, indexrelname AS index_name,
						idx_scan::text AS scans, pg_relation_size(indexrelid)::text AS size_bytes
					FROM pg_stat_user_indexes
					ORDER BY (idx_scan = 0) DESC, pg_relation_size(indexrelid) DESC LIMIT 50
				`),
				client.query<{ schema_name: string; size_bytes: string; table_name: string }>(`
					SELECT schemaname AS schema_name, relname AS table_name,
						pg_total_relation_size(relid)::text AS size_bytes
					FROM pg_catalog.pg_statio_user_tables
					ORDER BY pg_total_relation_size(relid) DESC LIMIT 20
				`),
			]);
			const connection = connections.rows[0];
			return {
				collectedAt: new Date().toISOString(),
				connections: { active: numeric(connection?.active), idle: numeric(connection?.idle), serverMaximum: numeric(connection?.maximum), total: numeric(connection?.total) },
				databaseSizeBytes: numeric(storage.rows[0]?.bytes),
				engine: 'postgresql',
				indexes: indexes.rows.map((row) => ({ indexName: row.index_name, scans: numeric(row.scans), schemaName: row.schema_name, sizeBytes: numeric(row.size_bytes), tableName: row.table_name, unused: numeric(row.scans) === 0 })),
				locks: locks.rows.map((row) => ({ granted: row.granted, mode: row.mode, objectName: row.object_name, sessionId: String(row.pid) })),
				sessions: sessions.rows.map((row) => ({ durationMs: numeric(row.duration_ms), id: String(row.pid), ...databaseDiagnosticQueryMetadata(row.query), state: row.state, waitEvent: row.wait_event })),
				slowThresholdSeconds,
				tableStorage: tables.rows.map((row) => ({ schemaName: row.schema_name, sizeBytes: numeric(row.size_bytes), tableName: row.table_name })),
				warnings,
			};
		} finally {
			await client.end();
		}
	}

	private async collectMysql(slowThresholdSeconds: number): Promise<DatabaseDiagnostics> {
		const connection = await mysql.createConnection({
			database: this.connection.databaseName,
			host: this.connection.host,
			password: this.connection.password,
			port: this.connection.port,
			ssl: this.connection.tlsMode === 'disabled' ? undefined : {},
			user: this.connection.username,
			connectTimeout: 8000,
		});
		const warnings: string[] = [];
		try {
			const [storageRows] = await connection.query<RowDataPacket[]>(`SELECT COALESCE(SUM(data_length + index_length), 0) AS bytes FROM information_schema.tables WHERE table_schema = DATABASE()`);
			const [connectionRows] = await connection.query<RowDataPacket[]>(`
				SELECT COUNT(*) AS total,
					SUM(command <> 'Sleep') AS active,
					SUM(command = 'Sleep') AS idle,
					@@max_connections AS maximum
				FROM information_schema.processlist WHERE db = DATABASE()
			`);
			const [sessionRows] = await connection.query<RowDataPacket[]>(`
				SELECT id, command, state, time, info
				FROM information_schema.processlist
				WHERE db = DATABASE() AND user = SUBSTRING_INDEX(CURRENT_USER(), '@', 1)
					AND id <> CONNECTION_ID() AND command <> 'Sleep' AND time >= ?
				ORDER BY time DESC LIMIT 100
			`, [slowThresholdSeconds]);
			const [tableRows] = await connection.query<RowDataPacket[]>(`
				SELECT table_schema, table_name, COALESCE(data_length + index_length, 0) AS size_bytes
				FROM information_schema.tables WHERE table_schema = DATABASE()
				ORDER BY size_bytes DESC LIMIT 20
			`);
			let indexRows: RowDataPacket[] = [];
			try {
				[indexRows] = await connection.query<RowDataPacket[]>(`
					SELECT object_schema, object_name, index_name
					FROM sys.schema_unused_indexes WHERE object_schema = DATABASE() LIMIT 50
				`);
			} catch {
				warnings.push('MySQL index-usage statistics are unavailable for this restricted login.');
			}
			warnings.push('MySQL lock details require optional Performance Schema privileges and are not exposed to restricted database users.');
			const summary = connectionRows[0];
			return {
				collectedAt: new Date().toISOString(),
				connections: { active: numeric(summary?.active), idle: numeric(summary?.idle), serverMaximum: numeric(summary?.maximum), total: numeric(summary?.total) },
				databaseSizeBytes: numeric(storageRows[0]?.bytes),
				engine: 'mysql',
				indexes: indexRows.map((row) => ({ indexName: String(row.index_name), scans: null, schemaName: String(row.object_schema), sizeBytes: null, tableName: String(row.object_name), unused: true })),
				locks: [],
				sessions: sessionRows.map((row) => ({ durationMs: numeric(row.time) * 1000, id: String(row.id), ...databaseDiagnosticQueryMetadata(row.info), state: String(row.state ?? row.command), waitEvent: row.state ? String(row.state) : null })),
				slowThresholdSeconds,
				tableStorage: tableRows.map((row) => ({ schemaName: String(row.table_schema), sizeBytes: numeric(row.size_bytes), tableName: String(row.table_name) })),
				warnings,
			};
		} finally {
			await connection.end();
		}
	}

	private async cancelPostgres(sessionId: string): Promise<{ cancelled: boolean; sessionId: string }> {
		const client = this.postgresClient();
		await client.connect();
		try {
			const result = await client.query<{ cancelled: boolean }>(`
				SELECT pg_cancel_backend(pid) AS cancelled
				FROM pg_stat_activity
				WHERE pid = $1 AND pid <> pg_backend_pid() AND datname = current_database()
					AND usename = current_user AND state = 'active'
			`, [Number(sessionId)]);
			if (!result.rows.length) throw new Error('The active database session was not found or is no longer cancellable.');
			return { cancelled: result.rows[0]?.cancelled === true, sessionId };
		} finally {
			await client.end();
		}
	}

	private async cancelMysql(sessionId: string): Promise<{ cancelled: boolean; sessionId: string }> {
		const connection = await mysql.createConnection({ database: this.connection.databaseName, host: this.connection.host, password: this.connection.password, port: this.connection.port, ssl: this.connection.tlsMode === 'disabled' ? undefined : {}, user: this.connection.username, connectTimeout: 8000 });
		try {
			const [rows] = await connection.query<RowDataPacket[]>(`
				SELECT id FROM information_schema.processlist
				WHERE id = ? AND id <> CONNECTION_ID() AND db = DATABASE()
					AND user = SUBSTRING_INDEX(CURRENT_USER(), '@', 1) AND command <> 'Sleep'
			`, [sessionId]);
			if (!rows.length) throw new Error('The active database session was not found or is no longer cancellable.');
			await connection.query(`KILL QUERY ${Number(sessionId)}`);
			return { cancelled: true, sessionId };
		} finally {
			await connection.end();
		}
	}
}
